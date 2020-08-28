/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
//tf.setBackend('wasm').then(() => startWebGL());

let s_debug_log;

function init_stats ()
{
    var stats = new Stats();
    var xPanel = stats.addPanel( new Stats.Panel( 'x', '#ff8', '#221' ) );
    var yPanel = stats.addPanel( new Stats.Panel( 'y', '#f8f', '#212' ) );
    stats.showPanel( 0 );
    document.body.appendChild( stats.dom );

    return stats;
}


function render_classification_result (gl, predictions)
{
    for (let i = 0; i < predictions.length; i ++)
    {
        let col_str  = [1.0, 1.0, 1.0, 1.0];
        let col_blue = [0.0, 0.0, 0.8, 0.8];
        let col_gray = [0.3, 0.3, 0.3, 0.8];
        let dy = 480 - 22 * (predictions.length - i);

        let item = predictions[i];
        let col_bg = item.probability > 0.5 ? col_blue : col_gray;

        let buf;
        buf = "[" + i + "]" + item.probability.toFixed(2) + "(" + item.index + ")" + item.class_name;
        dbgstr.draw_dbgstr_ex (gl, buf, 0, dy, 1.0, col_str, col_bg);
    }
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

    const camtex = GLUtil.create_camera_texture (gl);
    const imgtex = GLUtil.create_image_texture2 (gl, "pakutaso_strawberry.jpg");
    let image = imgtex.image;
    let texid = imgtex.texid;

    let win_w = canvas.clientWidth;
    let win_h = canvas.clientHeight;
    let cam_w = 0;
    let cam_h = 0;

    r2d.init_2d_render (gl, win_w, win_h);
    init_dbgstr (gl, win_w, win_h);
    pmeter.init_pmeter (gl, win_w, win_h, win_h - 40);
    const stats = init_stats ();


    await init_tfjs_classification ();
    s_debug_log.innerHTML = "tfjs.Backend = " + tf.getBackend() + "<br>"


    let count = 0;
    let prev_time_ms = performance.now();
    async function render (now)
    {
        pmeter.reset_lap (0);
        pmeter.set_lap (0);

        let cur_time_ms = performance.now();
        let interval_ms = cur_time_ms - prev_time_ms;
        prev_time_ms = cur_time_ms;

        stats.begin();

        if (GLUtil.is_camera_ready(camtex))
        {
            GLUtil.update_camera_texture (gl, camtex);
            cam_w = camtex.video.videoWidth;
            cam_h = camtex.video.videoHeight;
            image = camtex.video;
            texid = camtex.texid;
        }

        /* --------------------------------- *
         *  invoke TF.js
         * --------------------------------- */
        let time_invoke_start = performance.now();
        let predictions = await invoke_classification (image);
        let time_invoke = performance.now() - time_invoke_start;

        /* --------------------------------- *
         *  render results
         * --------------------------------- */
        gl.bindFramebuffer (gl.FRAMEBUFFER, null);
        gl.viewport (0, 0, win_w, win_h);
        gl.clear (gl.COLOR_BUFFER_BIT);

        r2d.draw_2d_texture (gl, texid, 0, 0, win_w, win_h, 0)

        render_classification_result (gl, predictions);

        pmeter.draw_pmeter (gl, 0, 40);

        let str = "Interval: " + interval_ms.toFixed(1) + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10);

        str = "TF.js   : " + time_invoke.toFixed(1)  + " [ms]";
        dbgstr.draw_dbgstr (gl, str, 10, 10 + 22 * 1);

        stats.end();
        requestAnimationFrame (render);
    }
    render ();
}
