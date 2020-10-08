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
        this.mask_alpha    = 1.0;
        this.flip_horizontal = true;
        this.depth_min     = 0.0;
        this.depth_max     = 5.0;
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

    let alpha = s_gui_prop.mask_alpha * 255;

    /* find the most confident class for each pixel. */
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
            imgbuf[4 * idx + 3] = alpha;
        }
    }

    let texid = GLUtil.create_2d_texture (gl, imgbuf, depthmap_w, depthmap_h);
    r2d.draw_2d_texture (gl, texid, ofstx, ofsty, texw, texh, 0)

    gl.deleteTexture (texid);
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

    gui.add (s_gui_prop, 'mask_alpha', 0.0, 1.0);
    gui.add (s_gui_prop, 'flip_horizontal');
    gui.add (s_gui_prop, 'depth_min', 0.0, 10.0);
    gui.add (s_gui_prop, 'depth_max', 0.0, 10.0);
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

    init_gui ();

    const camtex = GLUtil.create_camera_texture (gl);
    //const camtex = GLUtil.create_video_texture (gl, "pexels.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "pexels.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    await init_tfjs_dense_depth ();
    s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

    s_rtarget_main = GLUtil.create_render_target (gl, win_w, win_h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, win_w, win_w, 1);
    s_rtarget_src  = GLUtil.create_render_target (gl, win_w, win_w, 1);

    /* stop loading spinner */
    const spinner = document.getElementById('loading');
    spinner.classList.add('loaded');

    let prev_time_ms = performance.now();
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
            GLUtil.update_camera_texture (gl, camtex);
            src_w = camtex.video.videoWidth;
            src_h = camtex.video.videoHeight;
            texid = camtex.texid;
        }

        generate_squared_src_image (gl, texid, src_w, src_h, win_w, win_h);
        texid = s_rtarget_src.texid;

        /* --------------------------------------- *
         *  invoke TF.js (Dense Depth estimation)
         * --------------------------------------- */
        let dense_depth;
        let feed_image = generate_dense_depth_input_image (gl, texid, win_w, win_h);

        let time_invoke0_start = performance.now();
        dense_depth = await invoke_dense_depth (feed_image);
        let time_invoke0 = performance.now() - time_invoke0_start;

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        GLUtil.set_render_target (gl, s_rtarget_main);
        gl.clear (gl.COLOR_BUFFER_BIT);

        r2d.draw_2d_texture (gl, texid, 0, 0, win_w, win_h, 0)
        render_depth_image (gl, 0, 0, win_w, win_h, dense_depth);


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
