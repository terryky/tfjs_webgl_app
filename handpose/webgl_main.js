/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;


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
        this.camera_pos_z = 200;
        this.joint_radius = 6;
        this.bone_radius  = 2;
        this.srcimg_scale = 0.4;
        this.flip_horizontal = true;
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
    s_srctex_region.width  = src_w;     /* full rect width  with margin */
    s_srctex_region.height = src_h;     /* full rect height with margin */
    s_srctex_region.tex_x  = 0;         /* start position of valid texture */
    s_srctex_region.tex_y  = 0;         /* start position of valid texture */
    s_srctex_region.tex_w  = src_w;     /* width  of valid texture */
    s_srctex_region.tex_h  = src_h;     /* height of valid texture */
}


function
compute_3d_skelton_pos (dst_pose, src_pose)
{
    for (let i = 0; i < src_pose.length; i ++)
    {
        let x = src_pose[i][0] / s_srctex_region.tex_w;  /* [0, 1] */
        let y = src_pose[i][1] / s_srctex_region.tex_h;  /* [0, 1] */
        let z = src_pose[i][2] / s_srctex_region.tex_w;  /* [0, 1] */

        x = (x - 0.5) * s_gui_prop.pose_scale_x * 2;   /* [-scale, scale] */
        y = (y - 0.5) * s_gui_prop.pose_scale_y * 2;   /* [-scale, scale] */
        z = (z - 0.0) * s_gui_prop.pose_scale_z * 10;
        y = -y;
        z = -z;

        dst_pose.push ([x, y, z]);
    }
}


function
render_3d_bone (gl, mtxGlobal, pose, idx0, idx1, color, rad, is_shadow)
{
    const pos0 = pose[idx0];
    const pos1 = pose[idx1];

    draw_bone (gl, mtxGlobal, pos0, pos1, rad, color, is_shadow);
}


function
render_palm_tri (gl, mtxGlobal, pose, idx0, idx1, idx2, color)
{
    const pos0 = pose[idx0];
    const pos1 = pose[idx1];
    const pos2 = pose[idx2];

    draw_triangle (gl, mtxGlobal, pos0, pos1, pos2, color);
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
    let col_palm   = [0.8, 0.8, 0.8, 0.8];
    let col_gray   = [0.0, 0.0, 0.0, 0.1];
    let col_node   = [1.0, 1.0, 1.0, 1.0];

    let pose_draw = [];
    compute_3d_skelton_pos (pose_draw, landmarks);

    let pose = pose_draw;
    for (let is_shadow = 1; is_shadow >= 0; is_shadow --)
    {
        let colj;
        let coln = col_node;
        let colp = col_palm;

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
            matrix_translate (mtxGlobal, 0.0, shadow_y, 0.0);
            matrix_mult (mtxGlobal, mtxGlobal, mtxShadow);

            colj = col_gray;
            coln = col_gray;
            colp = col_gray;
        }

        /* joint point */
        for (let i = 0; i < pose.length; i ++)
        {
            if (!is_shadow)
            {
                if      (i >= 17) colj = col_violet;
                else if (i >= 13) colj = col_cyan;
                else if (i >=  9) colj = col_green;
                else if (i >=  5) colj = col_yellow;
                else              colj = col_red;
            }

            const rad = s_gui_prop.joint_radius;
            draw_sphere (gl, mtxGlobal, pose[i], rad, colj, is_shadow);
        }

        /* palm node */
        const rad = s_gui_prop.bone_radius;
        render_3d_bone (gl, mtxGlobal, pose,  0,  1, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  0, 17, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  1,  5, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  5,  9, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose,  9, 13, coln, rad, is_shadow);
        render_3d_bone (gl, mtxGlobal, pose, 13, 17, coln, rad, is_shadow);

        /* finger node */
        for (let i = 0; i < 5; i ++)
        {
            let idx0 = 4 * i + 1;
            let idx1 = idx0 + 1;
            render_3d_bone (gl, mtxGlobal, pose, idx0,  idx1  , coln, rad, is_shadow);
            render_3d_bone (gl, mtxGlobal, pose, idx0+1,idx1+1, coln, rad, is_shadow);
            render_3d_bone (gl, mtxGlobal, pose, idx0+2,idx1+2, coln, rad, is_shadow);
        }

        /* palm region */
        {
            render_palm_tri (gl, mtxGlobal, pose, 0,  1,  5, colp);
            render_palm_tri (gl, mtxGlobal, pose, 0,  5,  9, colp);
            render_palm_tri (gl, mtxGlobal, pose, 0,  9, 13, colp);
            render_palm_tri (gl, mtxGlobal, pose, 0, 13, 17, colp);
        }
    }
}


function render_3d_scene (gl, hand_predictions)
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
    for (let hand_id = 0; hand_id < hand_predictions.length; hand_id ++)
    {
        const landmarks = hand_predictions[hand_id].landmarks;
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

function render_2d_bone (gl, landmarks, idx0, idx1, scale, ox, oy)
{
    let color = [1.0, 1.0, 1.0, 1.0]
    let p0 = landmarks[idx0];
    let p1 = landmarks[idx1];
    r2d.draw_2d_line (gl, p0[0] * scale + ox, p0[1] * scale + oy,
                          p1[0] * scale + ox, p1[1] * scale + oy, color, 1);
}

function 
render_2d_scene (gl, texid, hand_predictions, tex_w, tex_h)
{
    let color = [0.0, 1.0, 1.0, 1.0]
    let radius = 5;
    let scale = s_gui_prop.srcimg_scale;
    let tx = 5;
    let ty = 60;
    let tw = tex_w * scale;
    let th = tex_h * scale;

    let flip = s_gui_prop.flip_horizontal ? r2d.FLIP_H : 0
    r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, flip)
    r2d.draw_2d_rect (gl, tx, ty, tw, th, [0.0, 1.0, 1.0, 1.0], 3.0);

    for (let i = 0; i < hand_predictions.length; i++) 
    {
        const landmarks = hand_predictions[i].landmarks;

        for (let j = 0; j < landmarks.length; j++)
        {
            let p = landmarks[j];
            x = p[0] * scale + tx;
            y = p[1] * scale + ty;

            r2d.draw_2d_fillrect (gl, x - radius/2, y - radius/2, radius,  radius, color);
            if (j == 0)
            {
                let str = p[0].toFixed(1) + ", " + p[1].toFixed(1) + ", " + p[2].toFixed(1);
                dbgstr.draw_dbgstr (gl, str, x, y);
            }
        }

        render_2d_bone (gl, landmarks,  0,  1, scale, tx, ty);
        render_2d_bone (gl, landmarks,  0, 17, scale, tx, ty);

        render_2d_bone (gl, landmarks,  1,  5, scale, tx, ty);
        render_2d_bone (gl, landmarks,  5,  9, scale, tx, ty);
        render_2d_bone (gl, landmarks,  9, 13, scale, tx, ty);
        render_2d_bone (gl, landmarks, 13, 17, scale, tx, ty);

        for (let j = 0; j < 5; j ++)
        {
            let idx0 = 4 * j + 1;
            let idx1 = idx0 + 1;
            render_2d_bone (gl, landmarks, idx0,  idx1  , scale, tx, ty);
            render_2d_bone (gl, landmarks, idx0+1,idx1+1, scale, tx, ty);
            render_2d_bone (gl, landmarks, idx0+2,idx1+2, scale, tx, ty);
        }
    }
}

function
flip_h_predictions (hand_predictions, tex_w)
{
    for (let i = 0; i < hand_predictions.length; i++)
    {
        let landmarks = hand_predictions[i].landmarks;

        for (let j = 0; j < landmarks.length; j++)
        {
            let p = landmarks[j];
            p[0] = (tex_w - p[0]);
        }
    }
}

var s_showme_count = 0;
function render_progress_bar (gl, current_phase, hand_predictions, win_w, win_h)
{
    if (hand_predictions.length > 0)
    {
        s_showme_count = 30;
        return;
    }

    if (current_phase >= 2 && s_showme_count > 0)
    {
        s_showme_count --;
        return;
    }

    let x = win_w * 0.25;
    let y = win_h * 0.5 - 50;
    let w = win_w * 0.5;
    let h = 100;
    let wp= (w / 2) * current_phase;
    r2d.draw_2d_fillrect   (gl, x, y, w,  h, [0.0, 0.4, 0.4, 0.2]);
    r2d.draw_2d_fillrect   (gl, x, y, wp, h, [0.0, 0.4, 0.4, 0.5]);
    r2d.draw_2d_rect       (gl, x, y, w,  h, [0.0, 1.0, 1.0, 0.8], 3.0);

    if (current_phase < 2)
    {
        x = win_w * 0.5 - 100;
        y = win_h * 0.5 - 22;
        let str = "Initializing[" + current_phase + "/2]...";
        dbgstr.draw_dbgstr_ex (gl, str, x, y,    1, [0.0, 1.0, 1.0, 1.0], [0.2, 0.2, 0.2, 1.0]);
        str = "Please wait a minute.";
        dbgstr.draw_dbgstr_ex (gl, str, x, y+22, 1, [0.0, 1.0, 1.0, 1.0], [0.2, 0.2, 0.2, 1.0]);

        return;
    }

    x = win_w * 0.5 - 100;
    y = win_h * 0.5 - 11;
    let str = " show me your hand ";
    dbgstr.draw_dbgstr_ex (gl, str, x, y, 1, [0.0, 1.0, 1.0, 1.0], [0.2, 0.2, 0.2, 1.0]);
}


function on_resize (gl)
{
    let w = gl.canvas.width;
    let h = gl.canvas.height;

    gl.viewport (0, 0, w, h);
    pmeter.resize (gl, w, h, h - 100);
    dbgstr.resize_viewport (gl, w, h);
    r2d.resize_viewport (gl, w, h);
    resize_handpose_render (gl, w, h);
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
    gui.add (s_gui_prop, 'flip_horizontal');
    gui.add (s_gui_prop, 'draw_axis');
    gui.add (s_gui_prop, 'draw_pmeter');
}


/* ---------------------------------------------------------------- *
 *      M A I N    F U N C T I O N
 * ---------------------------------------------------------------- */
function startWebGL()
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
    const imgtex = GLUtil.create_image_texture2 (gl, "pakutaso_vsign.jpg");

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_handpose_render (gl, win_w, win_h);

    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    //const stats = init_stats ();

    /* --------------------------------- *
     *  load HANDPOSE
     * --------------------------------- */
    let handpose_ready = false;
    let handpose_model;
    {
        function on_model_load (model)
        {
            handpose_ready = true;
            handpose_model = model;
        }

        function on_model_load_failed ()
        {
            alert('failed to load model');
        }

        let promise = handpose.load();
        promise.then (on_model_load)
               .catch(on_model_load_failed);
    }

    current_phase = 1;

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
         *  invoke TF.js (Handpose)
         * --------------------------------------- */
        generate_input_image (gl, texid, src_w, src_h, win_w, win_h);
        let hand_predictions = {length: 0};
        let time_invoke0 = 0;

        if (handpose_ready)
        {
            current_phase = 2;
            let time_invoke0_start = performance.now();

            //let flip_h = s_gui_prop.flip_horizontal;
            let flip_h = false;
            if (GLUtil.is_camera_ready(camtex))
                hand_predictions = await handpose_model.estimateHands (camtex.video, flip_h);
            else
                hand_predictions = await handpose_model.estimateHands (imgtex.image, flip_h);
            time_invoke0 = performance.now() - time_invoke0_start;

            if (s_gui_prop.flip_horizontal)
            {
                flip_h_predictions (hand_predictions, src_w);
            }
        }

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        render_3d_scene (gl, hand_predictions);
        render_2d_scene (gl, texid, hand_predictions, src_w, src_h);
        render_progress_bar (gl, current_phase, hand_predictions, win_w, win_h);

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
