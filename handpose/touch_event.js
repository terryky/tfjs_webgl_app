/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

var s_ev = {};
s_ev.mouse_down  = false;
s_ev.mouse_enter = false;
s_ev.clicked     = false;
s_ev.mouse_pos   = {x:0, y:0};
s_ev.mouse_pos0  = {x:0, y:0};
s_ev.wheel_pos   = 0;
s_ev.mdl_qtn     = new Array(4);
s_ev.mdl_qtn0    = new Array(4);
s_ev.mdl_mtx     = new Array(16);

s_ev.ongoing_touch = [];

/* ---------------------------------------------------------------- *
 *  Mouse Event
 * ---------------------------------------------------------------- */
function mouse_client_coord (canvas, event)
{
    let rect = canvas.getBoundingClientRect ();
    return {x: event.clientX - rect.left, 
            y: event.clientY - rect.top};
}

function on_mouse_down (event)
{
    s_ev.mouse_pos = mouse_client_coord (s_ev.canvas, event);
    s_ev.mouse_down = true;

    s_ev.mouse_pos0 = s_ev.mouse_pos;
    quaternion_copy (s_ev.mdl_qtn0, s_ev.mdl_qtn);

    //s_event_log.innerHTML += "mouse_down: (" + s_ev.mouse_pos.x + ", " + s_ev.mouse_pos.y + ")" + "<br>";
    //s_event_log.scrollTop = s_event_log.scrollHeight;
}

function on_mouse_up (event)
{
    s_ev.mouse_down = false;

    //s_event_log.innerHTML += "mouse_up: " + "<br>";
    //s_event_log.scrollTop = s_event_log.scrollHeight;
}

function on_mouse_move (event)
{
    s_ev.mouse_pos = mouse_client_coord (s_ev.canvas, event);

    if (s_ev.mouse_down)
    {
        let dx = s_ev.mouse_pos.x - s_ev.mouse_pos0.x;
        let dy = s_ev.mouse_pos.y - s_ev.mouse_pos0.y;
        let axis = [];
        axis[0] = 2 * Math.PI * dy / s_ev.canvas.height;
        axis[1] = 2 * Math.PI * dx / s_ev.canvas.width;
        axis[2] = 0;

        let rot = vec3_normalize (axis);
        let dqtn = [];
        quaternion_rotate (dqtn, rot, axis[0], axis[1], axis[2]);
        quaternion_mult (s_ev.mdl_qtn, dqtn, s_ev.mdl_qtn0);
        quaternion_to_matrix (s_ev.mdl_mtx, s_ev.mdl_qtn);

        //s_event_log.innerHTML += "mouse_move: (" + s_ev.mouse_pos.x + ", " + s_ev.mouse_pos.y + ")" + "<br>";
        //s_event_log.scrollTop = s_event_log.scrollHeight;
    }
}

function on_mouse_enter (event)
{
    s_ev.mouse_enter = true;
}

function on_mouse_leave (event)
{
    s_ev.mouse_enter = false;
}

function on_click (event)
{
    s_ev.clicked = true;
}

function on_dblclick (event)
{
    quaternion_identity (s_ev.mdl_qtn);
    quaternion_to_matrix (s_ev.mdl_mtx, s_ev.mdl_qtn);
}

function on_wheel (event)
{
    s_ev.wheel_pos += event.deltaY * 0.1;
}

/* ---------------------------------------------------------------- *
 *  Touch Event
 * ---------------------------------------------------------------- */
function touch_client_coord (canvas, event, id)
{
    let rect = canvas.getBoundingClientRect ();
    return {x: event.changedTouches[id].pageX - rect.left, 
            y: event.changedTouches[id].pageY - rect.top,
            id: event.changedTouches[id].identifier};
}

function get_touch_idx (key_id)
{
    for (let i = 0; i < s_ev.ongoing_touch.length; i ++)
    {
        if (s_ev.ongoing_touch[i].id == key_id)
            return i;
    }
    return -1;
}

function on_touch_start (event)
{
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i ++)
    {
        let mouse_pos = touch_client_coord (s_ev.canvas, event, i);
        s_ev.ongoing_touch.push (mouse_pos);

        //if (i == 0)
        //    s_event_log.innerHTML += "touch_start: ";
        //s_event_log.innerHTML += i + "(" + mouse_pos.x.toFixed(1) + "," + mouse_pos.y.toFixed(1) + ")";
    }
    //s_event_log.innerHTML += "<br>";
    //s_event_log.scrollTop = s_event_log.scrollHeight;

    if (s_ev.ongoing_touch.length == 1)
    {
        s_ev.mouse_pos0 = s_ev.ongoing_touch[0];
        quaternion_copy (s_ev.mdl_qtn0, s_ev.mdl_qtn);
    }
}

function on_touch_end (event)
{
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i ++)
    {
        let idx = get_touch_idx (event.changedTouches[i].identifier);
        if (idx >= 0)
        {
            s_ev.ongoing_touch.splice (idx, 1); /* remove it */
        }
    }
}

function on_touch_move (event)
{
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i ++)
    {
        let mouse_pos = touch_client_coord (s_ev.canvas, event, i);
        let idx = get_touch_idx (mouse_pos.id);
        if (idx >= 0)
        {
            s_ev.ongoing_touch.splice (idx, 1, mouse_pos); /* swap in the new touch record */
        }

        //if (i == 0)
        //    s_event_log.innerHTML += "touch_move : ";
        //s_event_log.innerHTML += i + "(" + mouse_pos.x.toFixed(1) + "," + mouse_pos.y.toFixed(1) + ")";
    }
    //s_event_log.innerHTML += "<br>";
    //s_event_log.scrollTop = s_event_log.scrollHeight;

    if (s_ev.ongoing_touch.length > 0)
    {
        let touch = s_ev.ongoing_touch[0];

        let dx = touch.x - s_ev.mouse_pos0.x;
        let dy = touch.y - s_ev.mouse_pos0.y;
        let axis = [];
        axis[0] = 2 * Math.PI * dy / s_ev.canvas.height;
        axis[1] = 2 * Math.PI * dx / s_ev.canvas.width;
        axis[2] = 0;

        let rot = vec3_normalize (axis);
        let dqtn = [];
        quaternion_rotate (dqtn, rot, axis[0], axis[1], axis[2]);
        quaternion_mult (s_ev.mdl_qtn, dqtn, s_ev.mdl_qtn0);
        quaternion_to_matrix (s_ev.mdl_mtx, s_ev.mdl_qtn);
    }
}


function
init_touch_event (canvas)
{
    canvas  .addEventListener ('mousedown' , on_mouse_down );
    document.addEventListener ('mouseup'   , on_mouse_up   );
    document.addEventListener ('mousemove' , on_mouse_move );
    canvas  .addEventListener ('mouseenter', on_mouse_enter);
    canvas  .addEventListener ('mouseleave', on_mouse_leave);
    canvas  .addEventListener ('click',      on_click      );
    canvas  .addEventListener ('dblclick',   on_dblclick   );
    canvas  .addEventListener ('wheel',      on_wheel      );

    canvas  .addEventListener ('touchstart' , on_touch_start);
    canvas  .addEventListener ('touchend'   , on_touch_end  );
    canvas  .addEventListener ('touchmove'  , on_touch_move );

    s_ev.canvas = canvas;

    quaternion_identity (s_ev.mdl_qtn);
    quaternion_to_matrix (s_ev.mdl_mtx, s_ev.mdl_qtn);
}

function
get_touch_event_matrix ()
{
    quaternion_to_matrix (s_ev.mdl_mtx, s_ev.mdl_qtn);
    s_ev.mdl_mtx[14] += s_ev.wheel_pos;
    return s_ev.mdl_mtx;
}
