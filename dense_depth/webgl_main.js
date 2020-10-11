/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;
let s_rtarget_main;
let s_rtarget_feed;
let s_rtarget_src;

class GuiProperty {
    constructor() {
        this.pause_camera  = false;
        this.depth_scale_x = 100;
        this.depth_scale_y = 100;
        this.depth_scale_z = 100;
        this.camera_pos_z  = 100;
        this.depth_min     =  0.0;
        this.depth_max     = 10.0;
        this.render_fill   = false;
        this.contour_alpha = 0.5;
        this.contour_interval = 5;
        this.srcimg_scale  = 0.2;
        this.flip_horizontal = true;
        this.draw_axis   = false;
        this.draw_pmeter   = false;
    }
}
const s_gui_prop = new GuiProperty();

function init_stats ()
{
    var stats = new Stats();
    var xPanel = stats.addPanel( new Stats.Panel( 'x', '#ff8', '#221' ) );
    var yPanel = stats.addPanel( new Stats.Panel( 'y', '#f8f', '#212' ) );
    stats.showPanel( 0 );
    document.body.appendChild( stats.dom );

    return stats;
}


function
generate_dense_depth_input_image (gl, texid, win_w, win_h)
{
    let dims = get_dense_depth_input_dims ();
    let buf_rgba = new Uint8Array (dims.w * dims.h * 4);
    let buf_rgb  = new Uint8Array (dims.w * dims.h * 3);

    GLUtil.set_render_target (gl, s_rtarget_feed);
    gl.clear (gl.COLOR_BUFFER_BIT);

    r2d.draw_2d_texture (gl, texid, 0, win_h - dims.h, dims.w, dims.h, r2d.FLIP_V);

    gl.readPixels (0, 0, dims.w, dims.h, gl.RGBA, gl.UNSIGNED_BYTE, buf_rgba);
    for (let i = 0, j = 0; i < buf_rgba.length; i ++)
    {
        if (i % 4 != 3)
            buf_rgb[j++] = buf_rgba[i];
    }

    GLUtil.set_render_target (gl, s_rtarget_main);

    return buf_rgb;
}




function clamp(min, max, val) {
    return Math.min(Math.max(min, +val), max);
}

function
render_depth_image (gl, ofstx, ofsty, texw, texh, dense_depth_ret)
{
    let depthmap   = dense_depth_ret.depthmap;
    let depthmap_w = dense_depth_ret.depthmap_dims[0];
    let depthmap_h = dense_depth_ret.depthmap_dims[1];
    let imgbuf = new Uint8Array (depthmap_h * depthmap_w * 4);

    for (let y = 0; y < depthmap_h; y ++)
    {
        for (let x = 0; x < depthmap_w; x ++)
        {
            let idx = (y * depthmap_w + x);

            let d = depthmap[idx];
            d -= s_gui_prop.depth_min;
            d /= s_gui_prop.depth_max;
            r = d * 255;
            r = clamp(0, 255, r);
            imgbuf[4 * idx + 0] = r;
            imgbuf[4 * idx + 1] = r;
            imgbuf[4 * idx + 2] = r;
            imgbuf[4 * idx + 3] = 255;
        }
    }

    let texid = GLUtil.create_2d_texture (gl, imgbuf, depthmap_w, depthmap_h);
    r2d.draw_2d_texture (gl, texid, ofstx, ofsty, texw, texh, 0)

    gl.deleteTexture (texid);
}

let s_is_first_render3d = true;
let s_depth_mesh;

function
render_depth_image_3d (gl, texid, dense_depth_ret)
{
    let mtxGlobal = new Array(16);
    let mtxTouch  = get_touch_event_matrix();
    matrix_identity (mtxGlobal);
    matrix_translate (mtxGlobal, 0, 0, -s_gui_prop.camera_pos_z);
    matrix_mult (mtxGlobal, mtxGlobal, mtxTouch);

    let depthmap   = dense_depth_ret.depthmap;
    let depthmap_w = dense_depth_ret.depthmap_dims[0];
    let depthmap_h = dense_depth_ret.depthmap_dims[1];

    /* create mesh object */
    if (s_is_first_render3d)
    {
        s_depth_mesh = create_mesh (gl, depthmap_w - 1, depthmap_h - 1);
        s_is_first_render3d = false;
    }
    let vtx = s_depth_mesh.vtx_array;
    let uv  = s_depth_mesh.uv_array;

    /* create 3D vertex coordinate */
    for (let y = 0; y < depthmap_h; y ++)
    {
        for (let x = 0; x < depthmap_w; x ++)
        {
            let idx = (y * depthmap_w + x);
            let d = depthmap[idx];

            if (1)
            {
                d -= s_gui_prop.depth_min;
                d /= s_gui_prop.depth_max;
                d = (d * 2.0 - 1.0) * s_gui_prop.depth_scale_z;
            }
            else
            {
                d = s_gui_prop.depth_max / d;   //  inf -> 1.0
                d = 2 - d;                      // -inf -> 1.0
                d = d * s_gui_prop.depth_scale_z;
            }

            vtx[3 * idx + 0] =  ((x / depthmap_h) * 2.0 - 1.0) * s_gui_prop.depth_scale_x;
            vtx[3 * idx + 1] = -((y / depthmap_h) * 2.0 - 1.0) * s_gui_prop.depth_scale_y;
            vtx[3 * idx + 2] =  d;

            uv [2 * idx + 0] = x / depthmap_w;
            uv [2 * idx + 1] = y / depthmap_h;
        }
    }
    let colb = [1.0, 1.0, 1.0, 1.0];

    if (s_gui_prop.render_fill)
    {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.0, 10.0);
        draw_mesh (gl, mtxGlobal, s_depth_mesh, texid, colb)
        gl.disable(gl.POLYGON_OFFSET_FILL);

        /* contour line */
        {
            let color = [0.5, 0.5, 0.5, s_gui_prop.contour_alpha];
            let contour_vtx = new Float32Array (depthmap_h * depthmap_w * 3 * 2);
            let contour_uv  = new Float32Array (depthmap_h * depthmap_w * 2 * 2);
            let contour_interval = Math.floor(s_gui_prop.contour_interval);
            let num_vtx = 0;
            let idx_dst = 0;

            for (let y = 0; y < depthmap_h; y += contour_interval)
            {
                for (let x = 0; x < depthmap_w; x += contour_interval)
                {
                    let x1 = x + contour_interval;
                    if (x1 > depthmap_w -1)
                        x1 = depthmap_w -1;

                    let idx_src0 = (y * depthmap_w + x);
                    let idx_src1 = (y * depthmap_w + x1);

                    contour_vtx[6 * idx_dst + 0] = vtx[3 * idx_src0 + 0];
                    contour_vtx[6 * idx_dst + 1] = vtx[3 * idx_src0 + 1];
                    contour_vtx[6 * idx_dst + 2] = vtx[3 * idx_src0 + 2];
                    contour_vtx[6 * idx_dst + 3] = vtx[3 * idx_src1 + 0];
                    contour_vtx[6 * idx_dst + 4] = vtx[3 * idx_src1 + 1];
                    contour_vtx[6 * idx_dst + 5] = vtx[3 * idx_src1 + 2];

                    contour_uv [4 * idx_dst + 0] = uv [2 * idx_src0 + 0];
                    contour_uv [4 * idx_dst + 1] = uv [2 * idx_src0 + 1];
                    contour_uv [4 * idx_dst + 2] = uv [2 * idx_src1 + 0];
                    contour_uv [4 * idx_dst + 3] = uv [2 * idx_src1 + 1];

                    idx_dst ++;
                    num_vtx += 2;
                }
            }
            draw_line_arrays (gl, mtxGlobal, contour_vtx, contour_uv, num_vtx, texid, color);

            num_vtx = 0;
            idx_dst = 0;
            for (let x = 0; x < depthmap_w; x += contour_interval)
            {
                for (let y = 0; y < depthmap_h; y += contour_interval)
                {
                    let y1 = y + contour_interval;
                    if (y1 > depthmap_h -1)
                        y1 = depthmap_h -1;

                    let idx_src0 = (y  * depthmap_w + x);
                    let idx_src1 = (y1 * depthmap_w + x);

                    contour_vtx[6 * idx_dst + 0] = vtx[3 * idx_src0 + 0];
                    contour_vtx[6 * idx_dst + 1] = vtx[3 * idx_src0 + 1];
                    contour_vtx[6 * idx_dst + 2] = vtx[3 * idx_src0 + 2];
                    contour_vtx[6 * idx_dst + 3] = vtx[3 * idx_src1 + 0];
                    contour_vtx[6 * idx_dst + 4] = vtx[3 * idx_src1 + 1];
                    contour_vtx[6 * idx_dst + 5] = vtx[3 * idx_src1 + 2];

                    contour_uv [4 * idx_dst + 0] = uv [2 * idx_src0 + 0];
                    contour_uv [4 * idx_dst + 1] = uv [2 * idx_src0 + 1];
                    contour_uv [4 * idx_dst + 2] = uv [2 * idx_src1 + 0];
                    contour_uv [4 * idx_dst + 3] = uv [2 * idx_src1 + 1];

                    idx_dst ++;
                    num_vtx += 2;
                }
            }
            draw_line_arrays (gl, mtxGlobal, contour_vtx, contour_uv, num_vtx, texid, color);
        }
    }
    else
    {
        draw_point_arrays (gl, mtxGlobal, vtx, uv, depthmap_h * depthmap_w, texid, colb);
    }

    /* axis */
    if (s_gui_prop.draw_axis)
    {
        for (let i = -1; i <= 1; i ++)
        {
            for (let j = -1; j <= 1; j ++)
            {
                let colb = [0.1, 0.5, 0.5, 0.5];
                let dx = s_gui_prop.depth_scale_x;
                let dy = s_gui_prop.depth_scale_y;
                let dz = s_gui_prop.depth_scale_z;
                let v0 = [];
                let v1 = [];

                v0  = [-dx, i * dy, j * dz];
                v1  = [ dx, i * dy, j * dz];

                let col = colb;
                if (i == 0 && j == 0)
                    col = [1.0, 0.0, 0.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);

                v0  = [i * dx, -dy, j * dz];
                v1  = [i * dx,  dy, j * dz];
                col = colb;
                if (i == 0 && j == 0)
                    col = [0.0, 1.0, 0.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);

                v0  = [i * dx, j * dy, -dz];
                v1  = [i * dx, j * dy,  dz];
                col = colb;
                if (i == 0 && j == 0)
                    col = [0.0, 0.0, 1.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);
            }
        }
    }
}


/* Adjust the texture size to fit the window size
 *
 *                      Portrait
 *     Landscape        +------+
 *     +-+------+-+     +------+
 *     | |      | |     |      |
 *     | |      | |     |      |
 *     +-+------+-+     +------+
 *                      +------+
 */
function
generate_squared_src_image (gl, texid, src_w, src_h, win_w, win_h)
{
    let win_aspect = win_w / win_h;
    let tex_aspect = src_w / src_h;
    let scale;
    let scaled_w, scaled_h;
    let offset_x, offset_y;

    if (win_aspect > tex_aspect)
    {
        scale = win_h / src_h;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = (win_w - scaled_w) * 0.5;
        offset_y = 0;
    }
    else
    {
        scale = win_w / src_w;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = 0;
        offset_y = (win_h - scaled_h) * 0.5;
    }

    GLUtil.set_render_target (gl, s_rtarget_src);
    gl.clearColor (0.7, 0.7, 0.7, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);

    let flip = r2d.FLIP_V;
    flip |= s_gui_prop.flip_horizontal ? r2d.FLIP_H : 0
    r2d.draw_2d_texture (gl, texid, offset_x, offset_y, scaled_w, scaled_h, flip)
}


function
init_gui ()
{
    const gui = new dat.GUI();

    gui.add (s_gui_prop, 'pause_camera');
    gui.add (s_gui_prop, 'depth_scale_x', 0, 1000);
    gui.add (s_gui_prop, 'depth_scale_y', 0, 1000);
    gui.add (s_gui_prop, 'depth_scale_z', 0, 1000);
    gui.add (s_gui_prop, 'camera_pos_z', 0, 1000);
    gui.add (s_gui_prop, 'depth_min', 0.0, 10.0);
    gui.add (s_gui_prop, 'depth_max', 0.0, 10.0);
    gui.add (s_gui_prop, 'render_fill');
    gui.add (s_gui_prop, 'contour_alpha'   , 0.0, 1.0);
    gui.add (s_gui_prop, 'contour_interval', 1, 50);
    gui.add (s_gui_prop, 'srcimg_scale', 0, 1.0);
    gui.add (s_gui_prop, 'flip_horizontal');
    gui.add (s_gui_prop, 'draw_axis');
    gui.add (s_gui_prop, 'draw_pmeter');
}

/* ---------------------------------------------------------------- *
 *      M A I N    F U N C T I O N
 * ---------------------------------------------------------------- */
async function startWebGL()
{
    s_debug_log = document.getElementById('debug_log');

    const canvas = document.querySelector('#glcanvas');
    const gl = canvas.getContext('webgl');
    if (!gl)
    {
        alert('Failed to initialize WebGL.');
        return;
    }

    gl.clearColor (0.7, 0.7, 0.7, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);

    init_touch_event (canvas);
    init_gui ();

    const camtex = GLUtil.create_camera_texture (gl);
    //const camtex = GLUtil.create_video_texture (gl, "pexels.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "pexels.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_dense_depth_render (gl, win_w, win_h);

    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    await init_tfjs_dense_depth ();
    s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

    s_rtarget_main = GLUtil.create_render_target (gl, win_w, win_h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, win_w, win_h, 1);
    s_rtarget_src  = GLUtil.create_render_target (gl, win_w, win_h, 1);

    /* stop loading spinner */
    const spinner = document.getElementById('loading');
    spinner.classList.add('loaded');

    let prev_time_ms = performance.now();
    let need_invoke_tflite = true;
    let dense_depth;
    async function render (now)
    {
        pmeter.reset_lap (0);
        pmeter.set_lap (0);

        let cur_time_ms = performance.now();
        let interval_ms = cur_time_ms - prev_time_ms;
        prev_time_ms = cur_time_ms;

        stats.begin();

        let src_w = imgtex.image.width;
        let src_h = imgtex.image.height;
        let texid = imgtex.texid;
        if (GLUtil.is_camera_ready(camtex))
        {
            if (s_gui_prop.pause_camera == false)
            {
                GLUtil.update_camera_texture (gl, camtex);
                need_invoke_tflite = true;
            }
            src_w = camtex.video.videoWidth;
            src_h = camtex.video.videoHeight;
            texid = camtex.texid;
        }

        generate_squared_src_image (gl, texid, src_w, src_h, win_w, win_h);
        texid = s_rtarget_src.texid;

        /* --------------------------------------- *
         *  invoke TF.js (Dense Depth estimation)
         * --------------------------------------- */
        let time_invoke0 = 0;
        if (need_invoke_tflite)
        {
            let feed_image = generate_dense_depth_input_image (gl, texid, win_w, win_h);

            let time_invoke0_start = performance.now();
            dense_depth = await invoke_dense_depth (feed_image);
            time_invoke0 = performance.now() - time_invoke0_start;

            need_invoke_tflite = false;
        }

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        GLUtil.set_render_target (gl, s_rtarget_main);
        gl.clearColor (0.1, 0.1, 0.44, 1.0);
        gl.clear (gl.COLOR_BUFFER_BIT);

        render_depth_image_3d (gl, texid, dense_depth);

        {
            let ox = 5;
            let oy = 60;
            let tw = src_w * s_gui_prop.srcimg_scale;
            let th = src_h * s_gui_prop.srcimg_scale;
            r2d.draw_2d_texture (gl, texid, ox, oy, tw, th, 0)
            render_depth_image (gl, ox, oy + th, tw, th, dense_depth);
            r2d.draw_2d_rect (gl, ox, oy,    tw, th, [1.0, 1.0, 1.0, 1.0], 3.0);
            r2d.draw_2d_rect (gl, ox, oy+th, tw, th, [1.0, 1.0, 1.0, 1.0], 3.0);
        }

        /* --------------------------------------- *
         *  post process
         * --------------------------------------- */
        if (s_gui_prop.draw_pmeter)
        {
            pmeter.draw_pmeter (gl, 0, 40);
        }

        let str = "Interval: " + interval_ms.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10);

        str = "TF.js0  : " + time_invoke0.toFixed(1)  + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10 + 22 * 1);

        stats.end();
        requestAnimationFrame (render);
    }
    render ();
}
