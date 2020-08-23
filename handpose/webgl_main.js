/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

//tf.setBackend('wasm').then(() => startWebGL());

function init_stats ()
{
    var stats = new Stats();
    var xPanel = stats.addPanel( new Stats.Panel( 'x', '#ff8', '#221' ) );
    var yPanel = stats.addPanel( new Stats.Panel( 'y', '#f8f', '#212' ) );
    stats.showPanel( 0 );
    document.body.appendChild( stats.dom );

    return stats;
}

function transform_coordinate (coord, cam_w, cam_h, zoffset)
{
    let x = coord[0];
    let y = coord[1];
    let z = coord[2];

    x =   2 * x - cam_w;
    y = - 2 * y + cam_h;
    z = - 4 * z - zoffset;

    return [x, y, z];
}

function render_node (gl, mtxGlobal, landmarks, idx0, idx1, color, camw_w, cam_h, zoffset, is_shadow)
{
    let pos0 = transform_coordinate (landmarks[idx0], camw_w, cam_h, zoffset);
    let pos1 = transform_coordinate (landmarks[idx1], camw_w, cam_h, zoffset);
    draw_bone (gl, mtxGlobal, pos0, pos1, 5.0, color, is_shadow);
}

function render_palm_tri (gl, mtxGlobal, landmarks, idx0, idx1, idx2, color, cam_w, cam_h, zoffset)
{
    pos0 = transform_coordinate (landmarks[idx0], cam_w, cam_h, zoffset);
    pos1 = transform_coordinate (landmarks[idx1], cam_w, cam_h, zoffset);
    pos2 = transform_coordinate (landmarks[idx2], cam_w, cam_h, zoffset);

    draw_triangle (gl, mtxGlobal, pos0, pos1, pos2, color);
}

function shadow_matrix (m, light_dir, ground_pos, ground_nrm)
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

function render_hand_landmark3d (gl, landmarks, cam_w, cam_h)
{
    let mtxGlobal = new Array(16);
    let col_red    = [1.0, 0.0, 0.0, 1.0];
    let col_yellow = [1.0, 1.0, 0.0, 1.0];
    let col_green  = [0.0, 1.0, 0.0, 1.0];
    let col_cyan   = [0.0, 1.0, 1.0, 1.0];
    let col_violet = [1.0, 0.0, 1.0, 1.0];
    let col_palm   = [0.8, 0.8, 0.8, 0.8];
    let col_gray   = [0.0, 0.0, 0.0, 0.1];
    let col_node   = [1.0, 1.0, 1.0, 1.0];

    let vp = gl.getParameter(gl.VIEWPORT);
    let zoffset = Math.max (vp[2], vp[3]);
    zoffset *= 0.5;

    for (let is_shadow = 0; is_shadow < 2; is_shadow ++)
    {
        let colj;
        let coln = col_node;
        let colp = col_palm;

        matrix_identity (mtxGlobal);

        if (is_shadow)
        {
            let mtxShadow = new Array(16);
            let light_dir  = [1.0, 2.0, 1.0];
            let ground_pos = [0.0, 0.0, 0.0];
            let ground_nrm = [0.0, 1.0, 0.0];

            shadow_matrix (mtxShadow, light_dir, ground_pos, ground_nrm);

            matrix_translate (mtxGlobal, 0.0, -cam_h, 0.0);
            matrix_mult (mtxGlobal, mtxGlobal, mtxShadow);

            colj = col_gray;
            coln = col_gray;
            colp = col_gray;
        }

        /* joint point */
        for (let i = 0; i < landmarks.length; i ++)
        {
            if (!is_shadow)
            {
                if      (i >= 17) colj = col_violet;
                else if (i >= 13) colj = col_cyan;
                else if (i >=  9) colj = col_green;
                else if (i >=  5) colj = col_yellow;
                else              colj = col_red;
            }

            let pos = transform_coordinate (landmarks[i], cam_w, cam_h, zoffset);
            draw_sphere (gl, mtxGlobal, pos, 20, colj, is_shadow);
        }

        /* palm node */
        render_node (gl, mtxGlobal, landmarks,  0,  1, coln, cam_w, cam_h, zoffset, is_shadow);
        render_node (gl, mtxGlobal, landmarks,  0, 17, coln, cam_w, cam_h, zoffset, is_shadow);
        render_node (gl, mtxGlobal, landmarks,  1,  5, coln, cam_w, cam_h, zoffset, is_shadow);
        render_node (gl, mtxGlobal, landmarks,  5,  9, coln, cam_w, cam_h, zoffset, is_shadow);
        render_node (gl, mtxGlobal, landmarks,  9, 13, coln, cam_w, cam_h, zoffset, is_shadow);
        render_node (gl, mtxGlobal, landmarks, 13, 17, coln, cam_w, cam_h, zoffset, is_shadow);

        /* finger node */
        for (let i = 0; i < 5; i ++)
        {
            let idx0 = 4 * i + 1;
            let idx1 = idx0 + 1;
            render_node (gl, mtxGlobal, landmarks, idx0,  idx1  , coln, cam_w, cam_h, zoffset, is_shadow);
            render_node (gl, mtxGlobal, landmarks, idx0+1,idx1+1, coln, cam_w, cam_h, zoffset, is_shadow);
            render_node (gl, mtxGlobal, landmarks, idx0+2,idx1+2, coln, cam_w, cam_h, zoffset, is_shadow);
        }

        /* palm region */
        {
            render_palm_tri (gl, mtxGlobal, landmarks, 0,  1,  5, colp, cam_w, cam_h, zoffset);
            render_palm_tri (gl, mtxGlobal, landmarks, 0,  5,  9, colp, cam_w, cam_h, zoffset);
            render_palm_tri (gl, mtxGlobal, landmarks, 0,  9, 13, colp, cam_w, cam_h, zoffset);
            render_palm_tri (gl, mtxGlobal, landmarks, 0, 13, 17, colp, cam_w, cam_h, zoffset);
        }
    }
}


function render_3d_scene (gl, hand_predictions, cam_w, cam_h)
{
    let mtxGlobal = new Array(16);
    let floor_size_x = 100.0;
    let floor_size_y = 100.0;
    let floor_size_z = 100.0;

    /* background */
    matrix_identity (mtxGlobal);
    matrix_translate (mtxGlobal, 0, floor_size_y * 0.9, 0);
    matrix_scale  (mtxGlobal, floor_size_x, floor_size_y, floor_size_z);
    draw_floor (gl, mtxGlobal);

    for (let hand_id = 0; hand_id < hand_predictions.length; hand_id ++)
    {
        const landmarks = hand_predictions[hand_id].landmarks;
        render_hand_landmark3d (gl, landmarks, cam_w, cam_h);
    }
}

function render_2d_node (gl, landmarks, idx0, idx1, scale, ox, oy)
{
    let color = [1.0, 1.0, 1.0, 1.0]
    let p0 = landmarks[idx0];
    let p1 = landmarks[idx1];
    r2d.draw_2d_line (gl, p0[0] * scale + ox, p0[1] * scale + oy,
                          p1[0] * scale + ox, p1[1] * scale + oy, color, 1);
}

function render_2d_scene (gl, texid, hand_predictions, cam_w, cam_h)
{
    let color = [0.0, 1.0, 1.0, 1.0]
    let radius = 5;
    let scale = 0.4;
    let ox = 5;
    let oy = 5;

    r2d.draw_2d_texture (gl, texid, ox, oy, cam_w * scale, cam_h * scale, 0)
    r2d.draw_2d_rect (gl, ox, oy, cam_w * scale, cam_h * scale, [0.0, 1.0, 1.0, 1.0], 3.0);

    for (let i = 0; i < hand_predictions.length; i++) 
    {
        const landmarks = hand_predictions[i].landmarks;

        for (let i = 0; i < landmarks.length; i++) 
        {
            let p = landmarks[i];
            x = p[0] * scale + ox;
            y = p[1] * scale + oy;
            r2d.draw_2d_fillrect (gl, x - radius/2, y - radius/2, radius,  radius, color);
            if (i == 0)
            {
                let str = p[0].toFixed(1) + ", " + p[1].toFixed(1) + ", " + p[2].toFixed(1);
                dbgstr.draw_dbgstr (gl, str, x, y);
            }
        }

        render_2d_node (gl, landmarks,  0,  1, scale, ox, oy);
        render_2d_node (gl, landmarks,  0, 17, scale, ox, oy);

        render_2d_node (gl, landmarks,  1,  5, scale, ox, oy);
        render_2d_node (gl, landmarks,  5,  9, scale, ox, oy);
        render_2d_node (gl, landmarks,  9, 13, scale, ox, oy);
        render_2d_node (gl, landmarks, 13, 17, scale, ox, oy);

        for (let i = 0; i < 5; i ++)
        {
            let idx0 = 4 * i + 1;
            let idx1 = idx0 + 1;
            render_2d_node (gl, landmarks, idx0,  idx1  , scale, ox, oy);
            render_2d_node (gl, landmarks, idx0+1,idx1+1, scale, ox, oy);
            render_2d_node (gl, landmarks, idx0+2,idx1+2, scale, ox, oy);
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

    if (current_phase >= 3 && s_showme_count > 0)
    {
        s_showme_count --;
        return;
    }

    let x = win_w * 0.25;
    let y = win_h * 0.5 - 50;
    let w = win_w * 0.5;
    let h = 100;
    let wp= (w / 3) * current_phase;
    r2d.draw_2d_fillrect   (gl, x, y, w,  h, [0.0, 0.4, 0.4, 0.2]);
    r2d.draw_2d_fillrect   (gl, x, y, wp, h, [0.0, 0.4, 0.4, 0.5]);
    r2d.draw_2d_rect       (gl, x, y, w,  h, [0.0, 1.0, 1.0, 0.8], 3.0);

    if (current_phase < 3)
    {
        x = win_w * 0.5 - 100;
        y = win_h * 0.5 - 22;
        let str = "Initializing[" + current_phase + "/3]...";
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

/* ---------------------------------------------------------------- *
 *      M A I N    F U N C T I O N
 * ---------------------------------------------------------------- */
function startWebGL()
{
    let debug_log = document.getElementById('debug_log');
    let time_load = -1.0, time_warmup = -1.0, time_invoke = -1.0;
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

    const camera = GLUtil.create_camera_texture (gl);

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;
    let cam_w = 0;
    let cam_h = 0;

    r2d.init_2d_render (gl, win_w, win_h);
    init_handpose_render (gl, win_w, win_h);

    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, 480, 400);
    //const stats = init_stats ();

    /* --------------------------------- *
     *  load HANDPOSE
     * --------------------------------- */
    let handpose_ready = false;
    let handpose_model;
    {
        let time_load_start = performance.now();

        function on_model_load (model)
        {
            handpose_ready = true;
            handpose_model = model;
            time_load = performance.now() - time_load_start;
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

    let prev_time_ms = performance.now();
    async function render (now)
    {
        pmeter.reset_lap (0);
        pmeter.set_lap (0);

        let cur_time_ms = performance.now();
        let interval_ms = cur_time_ms - prev_time_ms;
        prev_time_ms = cur_time_ms;

        //stats.begin();
        //debug_log.innerHTML  = "tfjs.Backend = " + tf.getBackend() + "<br>";
        //debug_log.innerHTML += "camera_ready = " + GLUtil.is_camera_ready(camera) + "<br>";
        //debug_log.innerHTML += "handpose_ready  = " + handpose_ready  + "<br>";

        check_resize_canvas (gl, canvas);

        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (GLUtil.is_camera_ready(camera))
        {
            GLUtil.update_camera_texture (gl, camera);
            cam_w = camera.video.videoWidth;
            cam_h = camera.video.videoHeight;
        }

        /* --------------------------------- *
         *  invoke HANDPOSE
         * --------------------------------- */
        let hand_predictions = {length: 0};

        if (GLUtil.is_camera_ready(camera))
        {
            if (current_phase == 1)
            {
                current_phase = 2;
            }
            else if (handpose_ready)
            {
                current_phase = 3;
                let time_invoke_start = performance.now();
                hand_predictions = await handpose_model.estimateHands (camera.video);
                hand_predictions_en = true;

                if (time_warmup <= 0)
                    time_warmup = performance.now() - time_invoke_start;
                else
                    time_invoke = performance.now() - time_invoke_start;
            }
        }

        render_3d_scene (gl, hand_predictions, cam_w, cam_h);
        render_2d_scene (gl, camera.texid, hand_predictions, cam_w, cam_h);
        render_progress_bar (gl, current_phase, hand_predictions, win_w, win_h);

        pmeter.draw_pmeter (gl, 0, 40);

        let str = "Interval: " + interval_ms.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10);

        str = "BACKEND: " + tf.getBackend();
        dbgstr.draw_dbgstr_ex (gl, str, win_w - 200, 22 * 0, 1, [0.0, 1.0, 1.0, 1.0], [0.2, 0.2, 0.2, 1.0]);

        str = "window(" + win_w + ", " + win_h + ")";
        dbgstr.draw_dbgstr (gl, str, win_w - 200, 22 * 1);

        str = "camera(" + cam_w + ", " + cam_h + ")";
        dbgstr.draw_dbgstr (gl, str, win_w - 200, 22 * 2);

        str = "load  : " + time_load.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, win_w - 200, 22 * 3);

        str = "warmup: " + time_warmup.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, win_w - 200, 22 * 4);

        str = "invoke: " + time_invoke.toFixed(1)  + " [ms]";
        dbgstr.draw_dbgstr (gl, str, win_w - 200, 22 * 5);

        //stats.end();
        requestAnimationFrame (render);
    }
    render ();
}

