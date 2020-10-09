/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
var render = {}

render.s_vtx = [
    -1.0, 1.0,  1.0,
    -1.0,-1.0,  1.0,
     1.0, 1.0,  1.0,
     1.0,-1.0,  1.0,

     1.0, 1.0, -1.0,
     1.0,-1.0, -1.0,
    -1.0, 1.0, -1.0,
    -1.0,-1.0, -1.0,

     1.0,  1.0, 1.0,
     1.0, -1.0, 1.0,
     1.0,  1.0,-1.0,
     1.0, -1.0,-1.0,

    -1.0,  1.0,-1.0,
    -1.0, -1.0,-1.0,
    -1.0,  1.0, 1.0,
    -1.0, -1.0, 1.0,
    
     1.0,  1.0, 1.0,
     1.0,  1.0,-1.0,
    -1.0,  1.0, 1.0,
    -1.0,  1.0,-1.0,
    
    -1.0, -1.0, 1.0,
    -1.0, -1.0,-1.0,
     1.0, -1.0, 1.0,
     1.0, -1.0,-1.0,
];

render.s_nrm = [
     0.0,  0.0,  1.0,
     0.0,  0.0, -1.0,
     1.0,  0.0,  0.0,
    -1.0,  0.0,  0.0,
     0.0,  1.0,  0.0,
     0.0, -1.0,  0.0,
];

render.s_nrm_inv = [
     0.0,  0.0, -1.0,
     0.0,  0.0,  1.0,
    -1.0,  0.0,  0.0,
     1.0,  0.0,  0.0,
     0.0, -1.0,  0.0,
     0.0,  1.0,  0.0,
];


render.s_uv = [
     0.0, 0.0,
     0.0, 1.0,
     1.0, 0.0,
     1.0, 1.0,
];

render.strVS = `
    attribute vec4  a_Vertex;
    attribute vec2  a_TexCoord;
    uniform   mat4  u_PMVMatrix;
    varying   vec2  v_texcoord;

    void main(void)
    {
        gl_Position = u_PMVMatrix * a_Vertex;
        gl_PointSize = 2.0;
        v_texcoord  = a_TexCoord;
    }
`;

render.strFS = `
    precision mediump float;

    uniform vec3    u_color;
    uniform float   u_alpha;
    varying vec2    v_texcoord;
    uniform sampler2D u_sampler;

    void main(void)
    {
        vec3 color;
        color = vec3(texture2D(u_sampler, v_texcoord));
        color *= u_color;
        gl_FragColor = vec4(color, u_alpha);
    }
`;




function init_dense_depth_render (gl, w, h)
{
    render.sobj = GLUtil.generate_shader (gl, render.strVS, render.strFS);
    render.loc_mtx_mv  = gl.getUniformLocation (render.sobj.program, "u_MVMatrix" );
    render.loc_mtx_pmv = gl.getUniformLocation (render.sobj.program, "u_PMVMatrix" );
    render.loc_mtx_nrm = gl.getUniformLocation (render.sobj.program, "u_ModelViewIT" );
    render.loc_color   = gl.getUniformLocation (render.sobj.program, "u_color" );
    render.loc_alpha   = gl.getUniformLocation (render.sobj.program, "u_alpha" );
    render.loc_lightpos= gl.getUniformLocation (render.sobj.program, "u_LightPos" );

    render.matPrj = new Array(16);
    matrix_proj_perspective (render.matPrj, 90.0, w / h, 1, 10000);

    render.texid_dummy = GLUtil.create_image_texture (gl, "../assets/white.png");
    gl.bindTexture (gl.TEXTURE_2D, render.texid_floor);
    gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameterf (gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameterf (gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    render.vbo_vtx = gl.createBuffer();
    render.vbo_nrm = gl.createBuffer();
    render.vbo_uv  = gl.createBuffer();
}

function resize_dense_depth_render (gl, w, h)
{
    matrix_proj_perspective (render.matPrj, 90.0, w / h, 1, 10000);
}



function draw_line (gl, mtxGlobal, p0, p1, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let floor_vtx = new Array( 6);

    for (let i = 0; i < 3; i ++)
    {
        floor_vtx[0 + i] = p0[i];
        floor_vtx[3 + i] = p1[i];
    }

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(floor_vtx), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(render.s_uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);
    gl.drawArrays (gl.LINES, 0, 2);

    gl.disable (gl.BLEND);
}

function draw_point (gl, mtxGlobal, p0, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(p0), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(render.s_uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);
    gl.drawArrays (gl.POINTS, 0, 1);

    gl.disable (gl.BLEND);
}


function draw_point_arrays (gl, mtxGlobal, vtx, uv, num, texid, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(vtx), gl.STREAM_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, texid);
    gl.drawArrays (gl.POINTS, 0, num);

    gl.disable (gl.BLEND);
}


function draw_line_arrays (gl, mtxGlobal, vtx, uv, num, texid, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, vtx, gl.STREAM_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, texid);
    gl.drawArrays (gl.LINES, 0, num);

    gl.disable (gl.BLEND);
}


function create_mesh (gl, num_tile_w, num_tile_h)
{
    let num_vtx_u = num_tile_w + 1;
    let num_vtx_v = num_tile_h + 1;
    let num_vtx   = num_vtx_u * num_vtx_v;

    let mesh = {};
    mesh.vtx_array = new Float32Array (num_vtx * 3);
    mesh.uv_array  = new Float32Array (num_vtx * 2);
    mesh.vbo_vtx   = gl.createBuffer();
    mesh.vbo_uv    = gl.createBuffer();
    mesh.vbo_idx   = gl.createBuffer();

    let num_tri = num_tile_w * num_tile_h * 2;
    let num_idx = num_tri * 3;
    let idx_array = new Uint16Array(num_idx);

    for (let tile_y = 0; tile_y < num_tile_h; tile_y ++)
    {
        for (let tile_x = 0; tile_x < num_tile_w; tile_x ++)
        {
            let idx = tile_y * num_tile_w + tile_x;

            idx_array[6 * idx + 0] = (tile_y  ) * num_vtx_u + (tile_x);    //  0 +----+ 2      + 3
            idx_array[6 * idx + 1] = (tile_y+1) * num_vtx_u + (tile_x);    //    |   /        /|
            idx_array[6 * idx + 2] = (tile_y  ) * num_vtx_u + (tile_x+1);  //    |  /        / |
            idx_array[6 * idx + 3] = (tile_y  ) * num_vtx_u + (tile_x+1);  //    | /        /  |
            idx_array[6 * idx + 4] = (tile_y+1) * num_vtx_u + (tile_x);    //    |/        /   |
            idx_array[6 * idx + 5] = (tile_y+1) * num_vtx_u + (tile_x+1);  //  1 +      4 +----+ 5
        }
    }
    mesh.idx_array = idx_array;
    mesh.num_tile_w = num_tile_w;
    mesh.num_tile_h = num_tile_h;
    mesh.num_idx    = num_idx;

    gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, mesh.vbo_idx);
    gl.bufferData (gl.ELEMENT_ARRAY_BUFFER, idx_array, gl.STATIC_DRAW);

    return mesh;
}


function draw_mesh (gl, mtxGlobal, mesh, texid, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(mesh.vtx_array), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(mesh.uv_array), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, texid);
    gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, mesh.vbo_idx);

    let slice_h = Math.floor(mesh.num_tile_h / 2);
    for (let y = 0; y < mesh.num_tile_h; y += slice_h)
    {
        if ((y + slice_h) >= mesh.num_tile_h) 
            slice_h = mesh.num_tile_h - y;

        let num_vtx_u = mesh.num_tile_w + 1;
        let offset_vtx = (y * num_vtx_u * 3) * 4;
        let offset_uv  = (y * num_vtx_u * 2) * 4;
        let num_index  = (slice_h * mesh.num_tile_w) * 6;

        gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
        gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(mesh.vtx_array), gl.STREAM_DRAW);
        gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, offset_vtx);

        gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
        gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(mesh.uv_array), gl.STATIC_DRAW);
        gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, offset_uv);

        gl.drawElements (gl.TRIANGLES, num_index, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable (gl.BLEND);
}
