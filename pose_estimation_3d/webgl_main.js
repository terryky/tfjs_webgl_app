/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;
let s_rtarget_main;
let s_rtarget_feed;


/*
 *  pose3d-space coordinate
 *
 *    -100  0  100
 *      +---+---+  100
 *      |   |   |
 *      +---+---+   0
 *      |   |   |
 *      +---+---+ -100
 */
class GuiProperty {
    constructor() {
        this.pose_scale_x = 100;
        this.pose_scale_y = 100;
        this.pose_scale_z = 100;
        this.camera_pos_z = 300;
        this.joint_radius = 8;
        this.bone_radius  = 2;
        this.srcimg_scale = 1.0;
        this.draw_axis   = false;
        this.draw_pmeter = false;
    }
}
const s_gui_prop = new GuiProperty();


let s_srctex_region = {
    width: 0, height: 0,                    /* full rect with margin */
    tex_x: 0, tex_y: 0, tex_w: 0, tex_h: 0  /* valid texture area */
};

function init_stats ()
{
    var stats = new Stats();
    var xPanel = stats.addPanel( new Stats.Panel( 'x', '#ff8', '#221' ) );
    var yPanel = stats.addPanel( new Stats.Panel( 'y', '#f8f', '#212' ) );
    stats.showPanel( 0 );
    document.body.appendChild( stats.dom );

    return stats;
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
generate_input_image (gl, texid, src_w, src_h, win_w, win_h)
{
    let dims = get_pose3d_input_dims ();
    let buf_rgba = new Uint8Array (dims.w * dims.h * 4);
    let buf_rgb  = new Uint8Array (dims.w * dims.h * 3);

    let dst_aspect = dims.w / dims.h;
    let tex_aspect = src_w / src_h;
    let scale;
    let scaled_w, scaled_h;
    let offset_x, offset_y;

    if (dst_aspect > tex_aspect)
    {
        scale = dims.h / src_h;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = (dims.w - scaled_w) * 0.5;
        offset_y = 0;
    }
    else
    {
        scale = dims.w / src_w;
        scaled_w = scale * src_w;
        scaled_h = scale * src_h;
        offset_x = 0;
        offset_y = (dims.h - scaled_h) * 0.5;
    }

    GLUtil.set_render_target (gl, s_rtarget_feed);
    gl.clear (gl.COLOR_BUFFER_BIT);

    /* draw valid texture area */
    const dx = offset_x;
    const dy = win_h - dims.h + offset_y;
    r2d.draw_2d_texture (gl, texid, dx, dy, scaled_w, scaled_h, 1);

    /* read full rect with margin */
    gl.readPixels (0, 0, dims.w, dims.h, gl.RGBA, gl.UNSIGNED_BYTE, buf_rgba);
    for (let i = 0, j = 0; i < buf_rgba.length; i ++)
    {
        if (i % 4 != 3)
            buf_rgb[j++] = buf_rgba[i];
    }

    GLUtil.set_render_target (gl, s_rtarget_main);

    s_srctex_region.width  = dims.w;    /* full rect width  with margin */
    s_srctex_region.height = dims.h;    /* full rect height with margin */
    s_srctex_region.tex_x  = offset_x;  /* start position of valid texture */
    s_srctex_region.tex_y  = offset_y;  /* start position of valid texture */
    s_srctex_region.tex_w  = scaled_w;  /* width  of valid texture */
    s_srctex_region.tex_h  = scaled_h;  /* height of valid texture */

    return buf_rgb;
}


function
compute_3d_skelton_pos (dst_pose, src_pose)
{
    /*
     *  because key3d[kNeck] is always zero,
     *  we need to add offsets (key2d[kNeck]) to translate it to the global world. 
     */
    const kNeck = 1;
    const neck_x  = src_pose.key[kNeck].x;
    const neck_y  = src_pose.key[kNeck].y;
    const xoffset = (neck_x - 0.5);
    const yoffset = (neck_y - 0.5);

    for (let i = 0; i < kPoseKeyNum; i ++)
    {
        let x = src_pose.key3d[i].x;
        let y = src_pose.key3d[i].y;
        let z = src_pose.key3d[i].z;
        let s = src_pose.key3d[i].score;

        x = (x + xoffset) * s_gui_prop.pose_scale_x * 2;
        y = (y + yoffset) * s_gui_prop.pose_scale_y * 2;
        z = z * s_gui_prop.pose_scale_z;
        y = -y;
        z = -z;

        dst_pose.key3d[i] = {x: x, y: y, z: z, score: s};
    }
}


function
render_3d_bone (gl, mtxGlobal, pose, idx0, idx1, color, rad, is_shadow)
{
    const pos0 = [pose.key3d[idx0].x, pose.key3d[idx0].y, pose.key3d[idx0].z];
    const pos1 = [pose.key3d[idx1].x, pose.key3d[idx1].y, pose.key3d[idx1].z];

    /* if the confidence score is low, draw more transparently. */
    const s0 = pose.key3d[idx0].score;
    const s1 = pose.key3d[idx1].score;
    const a  = color[3];

    color[3] = ((s0 > 0.1) && (s1 > 0.1)) ? a : 0.1;
    draw_bone (gl, mtxGlobal, pos0, pos1, rad, color, is_shadow);
    color[3] = a;
}

function
shadow_matrix (m, light_dir, ground_pos, ground_nrm)
{
    vec3_normalize (light_dir);
    vec3_normalize (ground_nrm);

    let a = ground_nrm[0];
    let b = ground_nrm[1];
    let c = ground_nrm[2];
    let d = 0;
    let ex = light_dir[0];
    let ey = light_dir[1];
    let ez = light_dir[2];

    m[ 0] =  b * ey + c * ez;
    m[ 1] = -a * ey;
    m[ 2] = -a * ez;
    m[ 3] = 0;

    m[ 4] = -b * ex;
    m[ 5] =  a * ex + c * ez;
    m[ 6] = -b * ez;
    m[ 7] = 0;

    m[ 8] = -c * ex;
    m[ 9] = -c * ey;
    m[10] =  a * ex + b * ey;
    m[11] = 0;

    m[12] = -d * ex;
    m[13] = -d * ey;
    m[14] = -d * ez;
    m[15] =  a * ex + b * ey + c * ey;
}

function 
render_skelton_3d (gl, landmarks)
{
    let mtxGlobal = new Array(16);
    let mtxTouch  = get_touch_event_matrix();
    let col_red    = [1.0, 0.0, 0.0, 1.0];
    let col_yellow = [1.0, 1.0, 0.0, 1.0];
    let col_green  = [0.0, 1.0, 0.0, 1.0];
    let col_cyan   = [0.0, 1.0, 1.0, 1.0];
    let col_violet = [1.0, 0.0, 1.0, 1.0];
    let col_blue   = [0.0, 0.5, 1.0, 1.0];
    let col_gray   = [0.0, 0.0, 0.0, 0.1];
    let col_node   = [1.0, 1.0, 1.0, 1.0];

    let pose_draw = {};
    pose_draw.key3d = [];
    compute_3d_skelton_pos (pose_draw, landmarks);

    let pose = pose_draw;
    for (let is_shadow = 1; is_shadow >= 0; is_shadow --)
    {
        let colj;
        let coln = col_node;

        matrix_identity (mtxGlobal);
        matrix_translate (mtxGlobal, 0.0, 0.0, -s_gui_prop.camera_pos_z);
        matrix_mult (mtxGlobal, mtxGlobal, mtxTouch);

        if (is_shadow)
        {
            let mtxShadow = new Array(16);
            let light_dir  = [1.0, 2.0, 1.0];
            let ground_pos = [0.0, 0.0, 0.0];
            let ground_nrm = [0.0, 1.0, 0.0];

            shadow_matrix (mtxShadow, light_dir, ground_pos, ground_nrm);

            let shadow_y = - s_gui_prop.pose_scale_y;
            //shadow_y += pose->key3d[kNeck].y * 0.5f;
            matrix_translate (mtxGlobal, 0.0, shadow_y, 0.0);
            matrix_mult (mtxGlobal, mtxGlobal, mtxShadow);

            colj = col_gray;
            coln = col_gray;
            colp = col_gray;
        }

        /* joint point */
        for (let i = 0; i < kPoseKeyNum - 1; i ++)
        {
            const keyx = pose.key3d[i].x;
            const keyy = pose.key3d[i].y;
            const keyz = pose.key3d[i].z;
            const score= pose.key3d[i].score;

            const vec = [keyx, keyy, keyz];

            if (!is_shadow)
            {
                if      (i >= 14) colj = col_blue;
                else if (i >= 11) colj = col_cyan;
                else if (i >=  8) colj = col_green;
                else if (i >=  5) colj = col_violet;
                else if (i >=  2) colj = col_red;
                else              colj = col_yellow;
            }

            const rad = (i < 14) ? s_gui_prop.joint_radius : s_gui_prop.joint_radius / 3;
            const alp = colj[3];
            colj[3] = (score > 0.1) ? alp : 0.1;
            draw_sphere (gl, mtxGlobal, vec, rad, colj, is_shadow);
            colj[3] = alp;
        }

        /* right arm */
        const rad = s_gui_prop.bone_radius;
        render_3d_bone (gl, mtxGlobal, pose,  1,  2, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  2,  3, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  3,  4, coln, rad, is_shadow);

        /* left arm */
        render_3d_bone (gl, mtxGlobal, pose,  1,  5, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  5,  6, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  6,  7, coln, rad, is_shadow);

        /* right leg */
        render_3d_bone (gl, mtxGlobal, pose,  1,  8, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  8,  9, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  9, 10, coln, rad, is_shadow);

        /* left leg */
        render_3d_bone (gl, mtxGlobal, pose,  1, 11, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose, 11, 12, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose, 12, 13, coln, rad, is_shadow);

        /* neck */
        render_3d_bone (gl, mtxGlobal, pose,  1,  0, coln, rad, is_shadow);

        /* eye */
        //render_3d_bone (gl, mtxGlobal, pose,  0, 14, coln, 1.0, is_shadow);
        //render_3d_bone (gl, mtxGlobal, pose, 14, 16, coln, 1.0, is_shadow);
        //render_3d_bone (gl, mtxGlobal, pose,  0, 15, coln, 1.0, is_shadow);
        //render_3d_bone (gl, mtxGlobal, pose, 15, 17, coln, 1.0, is_shadow);
    }
}


function render_3d_scene (gl, pose3d_predictions)
{
    let mtxGlobal = new Array(16);
    let mtxTouch  = get_touch_event_matrix();
    let floor_size_x = 300.0;
    let floor_size_y = 300.0;
    let floor_size_z = 300.0;

    /* background */
    matrix_identity (mtxGlobal);
    matrix_translate (mtxGlobal, 0, 0, -s_gui_prop.camera_pos_z);
    matrix_mult (mtxGlobal, mtxGlobal, mtxTouch);
    matrix_translate (mtxGlobal, 0, -s_gui_prop.pose_scale_y, 0);
    matrix_scale  (mtxGlobal, floor_size_x, floor_size_y, floor_size_z);
    matrix_translate (mtxGlobal, 0, 1.0, 0);
    draw_floor (gl, mtxGlobal, floor_size_x/10, floor_size_y/10);

    /* skelton */
    for (let pose_id = 0; pose_id < pose3d_predictions.length; pose_id ++)
    {
        const landmarks = pose3d_predictions[pose_id];
        render_skelton_3d (gl, landmarks);
    }

    if (s_gui_prop.draw_axis)
    {
        /* (xyz)-AXIS */
        matrix_identity (mtxGlobal);
        matrix_translate (mtxGlobal, 0, 0, -s_gui_prop.camera_pos_z);
        matrix_mult (mtxGlobal, mtxGlobal, mtxTouch);
        for (let i = -1; i <= 1; i ++)
        {
            for (let j = -1; j <= 1; j ++)
            {
                let colb = [0.1, 0.5, 0.5, 0.5];
                let dx = s_gui_prop.pose_scale_x;
                let dy = s_gui_prop.pose_scale_y;
                let dz = s_gui_prop.pose_scale_z;
                let rad = 1;
                let v0 = [];
                let v1 = [];

                v0  = [-dx, i * dy, j * dz];
                v1  = [ dx, i * dy, j * dz];

                col = colb;
                if (i == 0 && j == 0)
                    col = [1.0, 0.0, 0.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);
                draw_sphere (gl, mtxGlobal, v1, rad, col, 0);

                v0  = [i * dx, -dy, j * dz];
                v1  = [i * dx,  dy, j * dz];
                col = colb;
                if (i == 0 && j == 0)
                    col = [0.0, 1.0, 0.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);
                draw_sphere (gl, mtxGlobal, v1, rad, col, 0);

                v0  = [i * dx, j * dy, -dz];
                v1  = [i * dx, j * dy,  dz];
                col = colb;
                if (i == 0 && j == 0)
                    col = [0.0, 0.0, 1.0, 1.0];
                draw_line (gl, mtxGlobal, v0, v1, col);
                draw_sphere (gl, mtxGlobal, v1, rad, col, 0);
            }
        }
    }
}

function render_2d_bone (gl, ofstx, ofsty, drw_w, drw_h, pose_ret, pid, id0, id1, col)
{
    const x0 = pose_ret[pid].key[id0].x * drw_w + ofstx;
    const y0 = pose_ret[pid].key[id0].y * drw_h + ofsty;
    const x1 = pose_ret[pid].key[id1].x * drw_w + ofstx;
    const y1 = pose_ret[pid].key[id1].y * drw_h + ofsty;
    const s0 = pose_ret[pid].key[id0].score;
    const s1 = pose_ret[pid].key[id1].score;

    /* if the confidence score is low, draw more transparently. */
    col[3] = (s0 + s1) * 0.5;
    r2d.draw_2d_line (gl, x0, y0, x1, y1, col, 5.0);
    col[3] = 1.0;
}

function 
render_2d_scene (gl, texid, pose_ret)
{
    const col_red    = [1.0, 0.0, 0.0, 1.0];
    const col_yellow = [1.0, 1.0, 0.0, 1.0];
    const col_green  = [0.0, 1.0, 0.0, 1.0];
    const col_cyan   = [0.0, 1.0, 1.0, 1.0];
    const col_violet = [1.0, 0.0, 1.0, 1.0];
    const col_blue   = [0.0, 0.5, 1.0, 1.0];

    let color = [0.0, 1.0, 1.0, 1.0]
    let scale  = s_gui_prop.srcimg_scale;
    let tx = 5;
    let ty = 60;
    let tw = s_srctex_region.tex_w * scale;
    let th = s_srctex_region.tex_h * scale;
    let x = -s_srctex_region.tex_x * scale + tx;
    let y = -s_srctex_region.tex_y * scale + ty;
    let w =  s_srctex_region.width * scale;
    let h =  s_srctex_region.height * scale;

    r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, 0)
    r2d.draw_2d_rect (gl, tx, ty, tw, th, [0.0, 1.0, 1.0, 1.0], 3.0);

    for (let i = 0; i < pose_ret.length; i++)
    {
        /* right arm */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  1,  2, col_red);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  2,  3, col_red);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  3,  4, col_red);

        /* left arm */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  1,  5, col_violet);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  5,  6, col_violet);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  6,  7, col_violet);

        /* right leg */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  1,  8, col_green);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  8,  9, col_green);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  9, 10, col_green);

        /* left leg */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  1, 11, col_cyan);
        render_2d_bone (gl, x, y, w, h, pose_ret, i, 11, 12, col_cyan);
        render_2d_bone (gl, x, y, w, h, pose_ret, i, 12, 13, col_cyan);

        /* neck */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  1,  0, col_yellow);

        /* eye */
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  0, 14, col_blue);
        render_2d_bone (gl, x, y, w, h, pose_ret, i, 14, 16, col_blue);
        render_2d_bone (gl, x, y, w, h, pose_ret, i,  0, 15, col_blue);
        render_2d_bone (gl, x, y, w, h, pose_ret, i, 15, 17, col_blue);

        /* draw key points */
        for (let j = 0; j < kPoseKeyNum - 1; j++)
        {
            let  colj;
            if      (j >= 14) colj = col_blue;
            else if (j >= 11) colj = col_cyan;
            else if (j >=  8) colj = col_green;
            else if (j >=  5) colj = col_violet;
            else if (j >=  2) colj = col_red;
            else              colj = col_yellow;

            const keyx = pose_ret[i].key[j].x * w + x;
            const keyy = pose_ret[i].key[j].y * h + y;
            const score= pose_ret[i].key[j].score;

            let r = 9 * scale;
            colj[3] = score;
            r2d.draw_2d_fillrect (gl, keyx - (r/2), keyy - (r/2), r, r, colj);
            colj[3] = 1.0;
        }
    }
}


function on_resize (gl)
{
    let w = gl.canvas.width;
    let h = gl.canvas.height;

    gl.viewport (0, 0, w, h);
    pmeter.resize (gl, w, h, h - 100);
    dbgstr.resize_viewport (gl, w, h);
    r2d.resize_viewport (gl, w, h);
    resize_pose3d_render (gl, w, h);

    GLUtil.destroy_render_target (gl, s_rtarget_main);
    GLUtil.destroy_render_target (gl, s_rtarget_feed);
    s_rtarget_main = GLUtil.create_render_target (gl, w, h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, w, h, 1);
}

function check_resize_canvas (gl, canvas)
{
    let display_w = canvas.clientWidth;
    let display_h = canvas.clientHeight;

    if (canvas.width  != display_w ||
        canvas.height != display_h) 
    {
        canvas.width  = display_w;
        canvas.height = display_h;
        on_resize (gl);
    }
}


function
init_gui ()
{
    const gui = new dat.GUI();

    gui.add (s_gui_prop, 'pose_scale_x', 0, 1000);
    gui.add (s_gui_prop, 'pose_scale_y', 0, 1000);
    gui.add (s_gui_prop, 'pose_scale_z', 0, 1000);
    gui.add (s_gui_prop, 'camera_pos_z', 0, 1000);
    gui.add (s_gui_prop, 'joint_radius', 0, 20);
    gui.add (s_gui_prop, 'bone_radius',  0, 20);
    gui.add (s_gui_prop, 'srcimg_scale', 0, 5.0);
    gui.add (s_gui_prop, 'draw_axis');
    gui.add (s_gui_prop, 'draw_pmeter');
}


/* ---------------------------------------------------------------- *
 *      M A I N    F U N C T I O N
 * ---------------------------------------------------------------- */
async function startWebGL()
{
    s_debug_log = document.getElementById('debug_log');
    let current_phase = 0;

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
    //const camtex = GLUtil.create_video_texture (gl, "./assets/just_do_it.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "pakutaso_person.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_pose3d_render (gl, win_w, win_h);

    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    //const stats = init_stats ();


    await init_tfjs_pose3d ();
    //s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

    s_rtarget_main = GLUtil.create_render_target (gl, win_w, win_h, 0);
    s_rtarget_feed = GLUtil.create_render_target (gl, win_w, win_w, 1);

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

        //stats.begin();

        check_resize_canvas (gl, canvas);
        win_w = canvas.width;
        win_h = canvas.height;

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

        /* --------------------------------------- *
         *  invoke TF.js (Pose detection)
         * --------------------------------------- */
        let feed_image = generate_input_image (gl, texid, src_w, src_h, win_w, win_h);
        let pose3d_predictions = {length: 0};

        let time_invoke0_start = performance.now();
        pose3d_predictions = await await invoke_pose_detect (feed_image);
        let time_invoke0 = performance.now() - time_invoke0_start;


        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        GLUtil.set_render_target (gl, s_rtarget_main);
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        render_3d_scene (gl, pose3d_predictions);
        render_2d_scene (gl, texid, pose3d_predictions);

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

        str = "BACKEND: " + tf.getBackend();
        dbgstr.draw_dbgstr_ex (gl, str, win_w - 220, win_h - 22 * 3, 
            1, [0.0, 1.0, 1.0, 1.0], [0.2, 0.2, 0.2, 1.0]);

        str = "window(" + win_w + ", " + win_h + ")";
        dbgstr.draw_dbgstr (gl, str, win_w - 220, win_h - 22 * 2);

        str = "srcdim(" + src_w + ", " + src_h + ")";
        dbgstr.draw_dbgstr (gl, str, win_w - 220, win_h - 22 * 1);


        //stats.end();
        requestAnimationFrame (render);
    }
    render ();
}
