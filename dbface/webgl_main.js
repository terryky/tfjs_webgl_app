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
        this.detect_thresh     =  0.3;
        this.detect_nms_enable = true;
        this.detect_iou_thresh =  0.3;
        this.roi_size          = 40.0;
        this.depth_max         = 10.0;
        this.flip_horizontal   = true;
        this.draw_pmeter       = false;
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
generate_input_image (gl, texid, win_w, win_h)
{
    let dims = get_pose_detect_input_dims ();
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


function
render_detect_region (gl, ofstx, ofsty, texw, texh, detection)
{
    let col_white = [1.0, 1.0, 1.0, 1.0];
    let col_frame = [0.0, 0.5, 1.0, 1.0];

    for (let i = 0; i < detection.length; i ++)
    {
        region = detection[i];
        let x1 = region.topleft.x  * texw + ofstx;
        let y1 = region.topleft.y  * texh + ofsty;
        let x2 = region.btmright.x * texw + ofstx;
        let y2 = region.btmright.y * texh + ofsty;
        let score = region.score;

        /* rectangle region */
        r2d.draw_2d_rect (gl, x1, y1, x2-x1, y2-y1, col_frame, 2.0);

        /* class name */
        let buf = "" + i + ":" + (score * 100).toFixed(0);
        dbgstr.draw_dbgstr_ex (gl, buf, x1, y1-11, 0.5, col_white, col_frame);

        /* key points */
        for (let j = 0; j < kFaceKeyNum; j ++)
        {
            let x = region.keys[j].x * texw + ofstx;
            let y = region.keys[j].y * texh + ofsty;
            let r = 4;
            r2d.draw_2d_fillrect (gl, x - (r/2), y - (r/2), r, r, col_frame);
        }
    }
}


function
render_cropped_pose_image (gl, srctex, ofstx, ofsty, texw, texh, detection, pose_id)
{
    let texcoord = [];

    if (detection.length <= pose_id)
        return;

    region = detection[pose_id];
    let x0 = region.topleft .x;
    let y0 = region.topleft .y;
    let x1 = region.btmright.x;
    let y1 = region.btmright.y;
    texcoord[0] = x0;   texcoord[1] = y0;
    texcoord[2] = x0;   texcoord[3] = y1;
    texcoord[4] = x1;   texcoord[5] = y0;
    texcoord[6] = x1;   texcoord[7] = y1;

    r2d.draw_2d_texture_texcoord_rot (gl, srctex, ofstx, ofsty, texw, texh, texcoord, 0, 0, 0);
}

function
render_detect_faces (gl, texid, win_w, win_h, detection)
{
    let col_white = [1.0, 1.0, 1.0, 1.0];
    let col_frame = [0.0, 0.5, 1.0, 1.0];
    let w = s_gui_prop.roi_size;
    let h = s_gui_prop.roi_size;
    let yline = 0;
    let num_col = Math.floor(win_w / w);

    for (let pose_id = 0; pose_id < detection.length; pose_id ++)
    {
        let row = Math.floor(pose_id / num_col);
        let x = w * (pose_id % num_col);
        let y = win_h - (row + 1) * h;

        render_cropped_pose_image (gl, texid, x, y, w, h, detection, pose_id);
        r2d.draw_2d_rect (gl, x, y, w, h, col_frame, 2.0);

        let buf = "" + pose_id;
        dbgstr.draw_dbgstr_ex (gl, buf, x, y, 0.5, col_white, col_frame);
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
    gl.clearColor (0.0, 0.0, 0.0, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);

    let flip = r2d.FLIP_V;
    flip |= s_gui_prop.flip_horizontal ? r2d.FLIP_H : 0
    r2d.draw_2d_texture (gl, texid, offset_x, offset_y, scaled_w, scaled_h, flip)
}


function
init_gui ()
{
    const gui = new dat.GUI();

    gui.add (s_gui_prop, 'detect_thresh', 0.0, 1.0);
    gui.add (s_gui_prop, 'detect_nms_enable');
    gui.add (s_gui_prop, 'detect_iou_thresh', 0.0, 1.0);
    gui.add (s_gui_prop, 'roi_size', 0.0, 200.0);
    gui.add (s_gui_prop, 'flip_horizontal');
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

    gl.clearColor (0.0, 0.0, 0.0, 1.0);
    gl.clear (gl.COLOR_BUFFER_BIT);

    init_gui ();

    const camtex = GLUtil.create_camera_texture (gl);
    //const camtex = GLUtil.create_video_texture (gl, "pexels_dance.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "assets/pexels-davide-de-giovanni-3171822.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    await init_tfjs_blazepose ();
    s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

    s_rtarget_main = GLUtil.create_render_target (gl, win_w, win_h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, win_w, win_h, 1);
    s_rtarget_src  = GLUtil.create_render_target (gl, win_w, win_h, 1);

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
         *  invoke TF.js (Face detection)
         * --------------------------------------- */
        let feed_image = generate_input_image (gl, texid, win_w, win_h);

        let time_invoke0_start = performance.now();
        let predictions = await invoke_pose_detect (feed_image, s_gui_prop);
        let time_invoke0 = performance.now() - time_invoke0_start;

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        GLUtil.set_render_target (gl, s_rtarget_main);
        gl.clear (gl.COLOR_BUFFER_BIT);

        r2d.draw_2d_texture (gl, texid, 0, 0, win_w, win_h, 0)
        render_detect_region (gl, 0, 0, win_w, win_h, predictions);
        render_detect_faces (gl, texid, win_w, win_h, predictions);

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

        str = "detect num: " + predictions.length;
        dbgstr.draw_dbgstr (gl, str, 10, 10 + 22 * 2);

        stats.end();
        requestAnimationFrame (render);
    }
    render ();
}
