/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2019 terryky1220@gmail.com
 * ------------------------------------------------ */
var pmeter = {};

const PMETER_DPY_NUM     = 4;
const PMETER_MAX_LAP_NUM = 4;

pmeter.get_time_ms = function()
{
    return performance.now();
}

pmeter.reset_lap = function (dpy_id)
{
    if (dpy_id >= PMETER_DPY_NUM)
        return;

    pmeter.lap_cnt[dpy_id] = 0;
}

pmeter.set_lap = function (dpy_id)
{
    if (dpy_id >= PMETER_DPY_NUM)
        return;

    if (pmeter.lap_cnt[dpy_id] >= PMETER_MAX_LAP_NUM)
        return;

    let laptime = pmeter.get_time_ms ();
    let lap_idx = pmeter.lap_cnt[dpy_id];
    pmeter.laptime[dpy_id][lap_idx] = laptime - pmeter.last_laptime[dpy_id];
    pmeter.lap_cnt[dpy_id] ++;

    pmeter.last_laptime[dpy_id] = laptime;
}

pmeter.vs_pmeter = `
    attribute vec4 a_Vertex;
    uniform   vec4 u_Translate;
    uniform   vec4 u_PrjMul, u_PrjAdd;

    void main()
    {
       vec4 pos;
       pos = a_Vertex + u_Translate;
       pos = pos * u_PrjMul;
       gl_Position = pos + u_PrjAdd;
    }
`;

pmeter.fs_pmeter = `
    precision mediump float;
    uniform vec4  u_Color;
    void main()
    {
       gl_FragColor = u_Color;
    }
`;


pmeter.init_pmeter = function (gl, win_w, win_h, data_num)
{
    pmeter.sobj = GLUtil.generate_shader (gl, pmeter.vs_pmeter, pmeter.fs_pmeter);
    pmeter.locVtx    = gl.getAttribLocation  (pmeter.sobj.program, "a_Vertex" );
    pmeter.locTrans  = gl.getUniformLocation (pmeter.sobj.program, "u_Translate");
    pmeter.locPrjMul = gl.getUniformLocation (pmeter.sobj.program, "u_PrjMul" );
    pmeter.locPrjAdd = gl.getUniformLocation (pmeter.sobj.program, "u_PrjAdd" );
    pmeter.locCol    = gl.getUniformLocation (pmeter.sobj.program, "u_Color"  );

    pmeter.vertex       =  new Array(PMETER_DPY_NUM);
    pmeter.laptime      =  new Array(PMETER_DPY_NUM);
    pmeter.cursor       = (new Array(PMETER_DPY_NUM)).fill(0);
    pmeter.lap_cnt      = (new Array(PMETER_DPY_NUM)).fill(0);
    pmeter.last_laptime = (new Array(PMETER_DPY_NUM)).fill(0);
    for (let dpy = 0; dpy < PMETER_DPY_NUM; dpy ++)
    {
        pmeter.vertex [dpy] =  new Array(PMETER_MAX_LAP_NUM);
        pmeter.laptime[dpy] = (new Array(PMETER_MAX_LAP_NUM)).fill(0);

        for (let i = 0; i < PMETER_MAX_LAP_NUM; i ++ )
        {
            pmeter.vertex[dpy][i] = new Array(data_num * 2);
            for (let j = 0; j < data_num; j ++ )
            {
                pmeter.vertex[dpy][i][2 * j    ] = 0;
                pmeter.vertex[dpy][i][2 * j + 1] = j;
            }
        }
    }
    pmeter.wndW = win_w;
    pmeter.wndH = win_h;
    pmeter.data_num = data_num;

    pmeter.vbo_vtx = gl.createBuffer();
}

pmeter.resize = function (gl, win_w, win_h, data_num)
{
    if (data_num < 0)
        data_num = 0;

    pmeter.wndW = win_w;
    pmeter.wndH = win_h;
    pmeter.data_num = data_num;

    for (let dpy = 0; dpy < PMETER_DPY_NUM; dpy ++)
    {
        for (let i = 0; i < PMETER_MAX_LAP_NUM; i ++ )
        {
            pmeter.vertex[dpy][i] = new Array(data_num * 2);
            for (let j = 0; j < data_num; j ++ )
            {
                pmeter.vertex[dpy][i][2 * j    ] = 0;
                pmeter.vertex[dpy][i][2 * j + 1] = j;
            }
        }
    }
}

pmeter.set_pmeter_val = function (dpy_id, id, val)
{
    if (id >= PMETER_MAX_LAP_NUM)
        return;

    if (dpy_id >= PMETER_DPY_NUM)
        return;

    if (val > 100.0)
        val = 100.0;

    pmeter.vertex[dpy_id][id][2 * pmeter.cursor[dpy_id] + 0] = val;
}

pmeter.draw_pmeter_ex = function (gl, dpy_id, x, y, scale)
{
    var num_lap = pmeter.lap_cnt[dpy_id];
    var laptime = pmeter.laptime[dpy_id];

    let sumval = 0;
    for (let i = 0; i < num_lap; i ++)
        sumval += laptime[i];

    pmeter.set_pmeter_val (dpy_id, 0, sumval);     /* RED:     total  */
    pmeter.set_pmeter_val (dpy_id, 1, laptime[0]); /* BLUE:    render */
    pmeter.set_pmeter_val (dpy_id, 2, laptime[1]); /* SKYBLUE: render */
    pmeter.set_pmeter_val (dpy_id, 3, laptime[2]); /* SKYBLUE: render */

    pmeter.cursor[dpy_id] ++;
    if (pmeter.cursor[dpy_id] >= pmeter.data_num)
        pmeter.cursor[dpy_id] = 0;

    gl.useProgram (pmeter.sobj.program);

    gl.uniform4f (pmeter.locPrjMul, scale * 2.0 / pmeter.wndW, -2.0 / pmeter.wndH, 0.0, 0.0);
    gl.uniform4f (pmeter.locPrjAdd, -1.0, 1.0, 1.0, 1.0);

    gl.disable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE );
    gl.lineWidth (1.0);

    gl.enableVertexAttribArray (pmeter.locVtx);
    gl.bindBuffer (gl.ARRAY_BUFFER, pmeter.vbo_vtx);

    /* AXIS */
    var vert1 = [0.0, 0.0, 0.0, pmeter.data_num];
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(vert1), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);

    gl.uniform4f (pmeter.locCol, 0.5, 0.5, 0.5, 1.0);
    for (let i = 1; i <= 10; i ++)
    {
        gl.uniform4f (pmeter.locTrans, x + i * 10, y, 0.0, 0.0);
        gl.drawArrays (gl.LINES, 0, 2);
    }

    /* GRAPH */
    gl.uniform4f (pmeter.locTrans, x, y, 0.0, 0.0);

    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pmeter.vertex[dpy_id][0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f (pmeter.locCol, 1.0, 0.0, 0.0, 1.0);
    gl.drawArrays (gl.LINE_STRIP, 0, pmeter.data_num);
/*
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pmeter.vertex[dpy_id][1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f (pmeter.locCol, 0.0, 0.0, 1.0, 1.0);
    gl.drawArrays (gl.LINE_STRIP, 0, pmeter.data_num);

    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pmeter.vertex[dpy_id][2]), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f (pmeter.locCol, 1.0, 1.0, 1.0, 1.0);
    gl.drawArrays (gl.LINE_STRIP, 0, pmeter.data_num);

    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pmeter.vertex[dpy_id][3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f (pmeter.locCol, 1.0, 0.5, 0.2, 1.0);
    gl.drawArrays (gl.LINE_STRIP, 0, pmeter.data_num);
*/

    /* CURSOR */
    var vert2 = [0.0, 0.0, 100.0, 0.0];
    gl.bindBuffer (gl.ARRAY_BUFFER, pmeter.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(vert2), gl.STATIC_DRAW);
    gl.vertexAttribPointer (pmeter.locVtx, 2, gl.FLOAT, false, 0, 0);

    gl.uniform4f (pmeter.locCol, 0.0, 1.0, 0.0, 1.0);
    gl.uniform4f (pmeter.locTrans, x, y + pmeter.cursor[dpy_id], 0.0, 0.0); 

    gl.lineWidth (3.0);
    gl.drawArrays (gl.LINES, 0, 2);
    gl.lineWidth (1.00);
}

pmeter.draw_pmeter = function (gl, x, y)
{
    pmeter.draw_pmeter_ex (gl, 0, x, y, 1.0);
}

