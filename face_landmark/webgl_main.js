/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;
let s_is_dragover = false;
let s_drop_files = [];

class GuiProperty {
    constructor() {
        this.srcimg_scale = 1.0;
        this.mask_alpha   = 0.7;
        this.flip_horizontal = true;
        this.mask_eye_hole = false;
        this.draw_pmeter = false;
    }
}
const s_gui_prop = new GuiProperty();

let s_srctex_region;
let s_masktex_region;


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
calc_size_to_fit (gl, src_w, src_h, win_w, win_h)
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

    let region = {
        width  : win_w,     /* full rect width  with margin */
        height : win_h,     /* full rect height with margin */
        tex_x  : offset_x,  /* start position of valid texture */
        tex_y  : offset_y,  /* start position of valid texture */
        tex_w  : scaled_w,  /* width  of valid texture */
        tex_h  : scaled_h,  /* height of valid texture */
        scale  : scale,
    }
    return region;
}


function 
render_2d_scene (gl, texid, face_predictions, tex_w, tex_h,
                 masktex, mask_predictions)
{
    let color = [0.0, 1.0, 1.0, 0.5]
    let radius = 5;
    let tx = s_srctex_region.tex_x;
    let ty = s_srctex_region.tex_y;
    let tw = s_srctex_region.tex_w;
    let th = s_srctex_region.tex_h;
    let scale = s_srctex_region.scale;
    let flip_h = s_gui_prop.flip_horizontal;

    gl.disable (gl.DEPTH_TEST);

    let flip = flip_h ? r2d.FLIP_H : 0
    r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, flip)

    let mask_color = [1.0, 1.0, 1.0, s_gui_prop.mask_alpha];
    if (s_is_dragover)
        mask_color = [0.8, 0.8, 0.8, 1.0];

    for (let i = 0; i < face_predictions.length; i++) 
    {
        const keypoints = face_predictions[i].scaledMesh;

        /* render the deformed mask image onto the camera image */
        if (mask_predictions.length > 0)
        {
            const mask_keypoints = mask_predictions[0].scaledMesh;

            let face_vtx = new Array(keypoints.length * 3);
            let face_uv  = new Array(keypoints.length * 2);
            for (let i = 0; i < keypoints.length; i++)
            {
                let p = keypoints[i];
                face_vtx[3 * i + 0] = p[0] * scale + tx;
                face_vtx[3 * i + 1] = p[1] * scale + ty;
                face_vtx[3 * i + 2] = p[2];

                let q = mask_keypoints[i];
                face_uv [2 * i + 0] = q[0] / masktex.image.width;
                face_uv [2 * i + 1] = q[1] / masktex.image.height;

                if (flip_h)
                {
                    face_vtx[3 * i + 0] = (tex_w - p[0]) * scale + tx;
                }
            }

            let eye_hole = s_gui_prop.mask_eye_hole;
            draw_facemesh_tri_tex (gl, masktex.texid, face_vtx, face_uv, mask_color, eye_hole, flip_h)
        }
    }

    /* render 2D mask image */
    if (mask_predictions.length > 0)
    {
        let texid = masktex.texid;
        let tx = 5;
        let ty = 60;
        let tw = s_masktex_region.tex_w * s_gui_prop.srcimg_scale;
        let th = s_masktex_region.tex_h * s_gui_prop.srcimg_scale;
        let radius = 2;
        r2d.draw_2d_texture (gl, texid, tx, ty, tw, th, 0)
        r2d.draw_2d_rect (gl, tx, ty, tw, th, [1.0, 1.0, 1.0, 1.0], 3.0);

        const mask_keypoints = mask_predictions[0].scaledMesh;
        for (let i = 0; i < mask_keypoints.length; i++)
        {
            let p = mask_keypoints[i];
            x = p[0] / masktex.image.width  * tw + tx;
            y = p[1] / masktex.image.height * th + ty;
            r2d.draw_2d_fillrect (gl, x - radius/2, y - radius/2, radius,  radius, color);
        }
    }
}

var s_showme_count = 0;
function render_progress_bar (gl, current_phase, face_predictions, win_w, win_h)
{
    if (face_predictions.length > 0)
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
    let str = " show me your face ";
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
    resize_facemesh_render (gl, w, h);
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

    gui.add (s_gui_prop, 'srcimg_scale', 0, 5.0);
    gui.add (s_gui_prop, 'mask_alpha', 0.0, 1.0);
    gui.add (s_gui_prop, 'flip_horizontal');
    gui.add (s_gui_prop, 'mask_eye_hole');
    gui.add (s_gui_prop, 'draw_pmeter');
}


/* ---------------------------------------------------------------- *
 *  Drag and Drop Event
 * ---------------------------------------------------------------- */
function on_dragover (event)
{
    event.preventDefault();
    s_is_dragover = true;
}

function on_dragleave (event)
{
    event.preventDefault();
    s_is_dragover = false;
}

function on_drop (event)
{
    event.preventDefault();
    s_is_dragover = false;
    s_drop_files = event.dataTransfer.files;
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

    canvas.addEventListener ('dragover',  on_dragover);
    canvas.addEventListener ('dragleave', on_dragleave);
    canvas.addEventListener ('drop' ,     on_drop);

    init_gui ();

    const camtex = GLUtil.create_camera_texture (gl);
    //const camtex = GLUtil.create_video_texture (gl, "./assets/just_do_it.mp4");
    const imgtex = GLUtil.create_image_texture2 (gl, "pakutaso_sotsugyou.jpg");

    let masktex = GLUtil.create_image_texture2 (gl, "./assets/mask/khamun.jpg");
    let masktex_next;
    let mask_predictions = {length: 0};
    let mask_init_done = false;
    let mask_update_req = false;

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;

    r2d.init_2d_render (gl, win_w, win_h);
    init_facemesh_render (gl, win_w, win_h);

    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    /* --------------------------------- *
     *  load FACEMESH
     * --------------------------------- */
    let facemesh_ready = false;
    let facemesh_model;
    {
        function on_facemesh_model_load (model)
        {
            facemesh_ready = true;
            facemesh_model = model;
        }

        function on_facemesh_model_load_failed ()
        {
            alert('failed to load facemesh model');
        }

        let promise = faceLandmarksDetection.load(
            faceLandmarksDetection.SupportedPackages.mediapipeFacemesh);
        promise.then (on_facemesh_model_load)
               .catch(on_facemesh_model_load_failed);
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
        s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"

        let cur_time_ms = performance.now();
        let interval_ms = cur_time_ms - prev_time_ms;
        prev_time_ms = cur_time_ms;

        stats.begin();

        check_resize_canvas (gl, canvas);
        win_w = canvas.width;
        win_h = canvas.height;


        /* --------------------------------------- *
         *  Update Mask (if need)
         * --------------------------------------- */
        let mask_updated = false;
        if (facemesh_ready)
        {
            if (mask_init_done == false)
            {
                for (let i = 0; i < 5; i ++) /* repeat 5 times to flush pipeline ? */
                    mask_predictions = await facemesh_model.estimateFaces ({input: masktex.image});
                mask_init_done = true;
                s_masktex_region = calc_size_to_fit (gl, masktex.image.width, masktex.image.height, 150, 150);
                mask_updated = true;
            }

            if (s_drop_files.length > 0)
            {
                masktex_next = GLUtil.create_image_texture_from_file (gl, s_drop_files[0]);
                mask_update_req = true;
                s_drop_files = [];
            }

            if (mask_update_req)
            {
                /* if readfile has done, update face mask */
                if (masktex_next.image.width > 0)
                {
                    for (let i = 0; i < 5; i ++) /* repeat 5 times to flush pipeline ? */
                        mask_predictions = await facemesh_model.estimateFaces ({input: masktex_next.image});
                    mask_update_req = false;
                    masktex = masktex_next;
                    s_masktex_region = calc_size_to_fit (gl, masktex.image.width, masktex.image.height, 150, 150);
                    mask_updated = true;
                }
            }
            gl.bindFramebuffer (gl.FRAMEBUFFER, null);
            gl.viewport (0, 0, win_w, win_h);
            gl.scissor  (0, 0, win_w, win_h);
        }


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
         *  invoke TF.js (Facemesh)
         * --------------------------------------- */
        s_srctex_region = calc_size_to_fit (gl, src_w, src_h, win_w, win_h);
        let face_predictions = {length: 0};
        let time_invoke0 = 0;

        if (facemesh_ready)
        {
            current_phase = 2;
            let time_invoke1_start = performance.now();

            num_repeat = mask_updated ? 2 : 1;
            for (let i = 0; i < num_repeat; i ++) /* repeat 5 times to flush pipeline ? */
            {
                if (GLUtil.is_camera_ready(camtex))
                    face_predictions = await facemesh_model.estimateFaces ({input: camtex.video});
                else
                    face_predictions = await facemesh_model.estimateFaces ({input: imgtex.image});
            }
            time_invoke0 = performance.now() - time_invoke1_start;
        }

        /* --------------------------------------- *
         *  render scene
         * --------------------------------------- */
        gl.clear (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        render_2d_scene (gl, texid, face_predictions, src_w, src_h, masktex, mask_predictions);
        render_progress_bar (gl, current_phase, face_predictions, win_w, win_h);

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
