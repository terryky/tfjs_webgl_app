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
    attribute vec3  a_Normal;
    attribute vec2  a_TexCoord;
    uniform   mat4  u_PMVMatrix;
    uniform   mat4  u_MVMatrix;
    uniform   mat3  u_ModelViewIT;
    varying   vec3  v_diffuse;
    varying   vec3  v_specular;
    varying   vec2  v_texcoord;
    const     float shiness = 16.0;
    uniform   vec3  u_LightPos;
    const     vec3  LightCol = vec3(1.0, 1.0, 1.0);

    void DirectionalLight (vec3 normal, vec3 eyePos)
    {
        vec3  lightDir = normalize (u_LightPos);
        vec3  halfV    = normalize (u_LightPos - eyePos);
        float dVP      = max(dot(normal, lightDir), 0.0);
        float dHV      = max(dot(normal, halfV   ), 0.0);

        float pf = 0.0;
        if(dVP > 0.0)
            pf = pow(dHV, shiness);

        v_diffuse += dVP * LightCol;
        v_specular+= pf  * LightCol * 0.5;
    }

    void main(void)
    {
        gl_Position = u_PMVMatrix * a_Vertex;
        vec3 normal = normalize(u_ModelViewIT * a_Normal);
        vec3 eyePos = vec3(u_MVMatrix * a_Vertex);

        v_diffuse  = vec3(0.5);
        v_specular = vec3(0.0);
        DirectionalLight(normal, eyePos);

        v_diffuse = clamp(v_diffuse, 0.0, 1.0);
        v_texcoord  = a_TexCoord;
    }
`;

render.strFS = `
    precision mediump float;

    uniform vec3    u_color;
    uniform float   u_alpha;
    varying vec3    v_diffuse;
    varying vec3    v_specular;
    varying vec2    v_texcoord;
    uniform sampler2D u_sampler;

    void main(void)
    {
        vec3 color;
        color = vec3(texture2D(u_sampler, v_texcoord));
        color *= (u_color * v_diffuse);
        //color += v_specular;
        gl_FragColor = vec4(color, u_alpha);
    }
`;




function init_handpose_render (gl, w, h)
{
    render.sobj = GLUtil.generate_shader (gl, render.strVS, render.strFS);
    render.loc_mtx_mv  = gl.getUniformLocation (render.sobj.program, "u_MVMatrix" );
    render.loc_mtx_pmv = gl.getUniformLocation (render.sobj.program, "u_PMVMatrix" );
    render.loc_mtx_nrm = gl.getUniformLocation (render.sobj.program, "u_ModelViewIT" );
    render.loc_color   = gl.getUniformLocation (render.sobj.program, "u_color" );
    render.loc_alpha   = gl.getUniformLocation (render.sobj.program, "u_alpha" );
    render.loc_lightpos= gl.getUniformLocation (render.sobj.program, "u_LightPos" );

    render.matPrj = new Array(16);
    matrix_proj_perspective (render.matPrj, 72.0, w / h, 1, 10000);

    render.texid_dummy = GLUtil.create_image_texture (gl, "../assets/white.png");
    render.texid_floor = GLUtil.create_image_texture (gl, "./floortile.png");
    gl.bindTexture (gl.TEXTURE_2D, render.texid_floor);
    gl.texParameteri (gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameterf (gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameterf (gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    render.vbo_vtx = gl.createBuffer();
    render.vbo_nrm = gl.createBuffer();
    render.vbo_uv  = gl.createBuffer();

    render.shape_cylinder = shapes.shape_create (gl, shapes.SHAPE_CYLINDER, 30, 30);
    render.shape_sphere       = shapes.shape_create (gl, shapes.SHAPE_SPHERE,   30, 30);
}

function resize_handpose_render (gl, w, h)
{
    matrix_proj_perspective (render.matPrj, 72.0, w / h, 1, 10000);
}


render.compute_invmat3x3 = function (matMVI3x3, matMV)
{
    let matMVI4x4 = new Array(16);

    matrix_copy (matMVI4x4, matMV);
    matrix_invert   (matMVI4x4);
    matrix_transpose(matMVI4x4);
    matMVI3x3[0] = matMVI4x4[0];
    matMVI3x3[1] = matMVI4x4[1];
    matMVI3x3[2] = matMVI4x4[2];
    matMVI3x3[3] = matMVI4x4[4];
    matMVI3x3[4] = matMVI4x4[5];
    matMVI3x3[5] = matMVI4x4[6];
    matMVI3x3[6] = matMVI4x4[8];
    matMVI3x3[7] = matMVI4x4[9];
    matMVI3x3[8] = matMVI4x4[10];
}


function draw_bone (gl, mtxGlobal, p0, p1, radius, color, is_shadow)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let matMVI3x3 = new Array( 9);

    if (!is_shadow)
        gl.enable (gl.DEPTH_TEST);

    gl.enable (gl.CULL_FACE);
    gl.frontFace (gl.CW);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );
    gl.enableVertexAttribArray (render.sobj.loc_nrm);

    matrix_identity (matMV);

    {
        let dp = [];
        dp[0] = p1[0] - p0[0];
        dp[1] = p1[1] - p0[1];
        dp[2] = p1[2] - p0[2];

        let len = vec3_length (dp);
        matrix_scale     (matMV, radius * 2, radius * 2, 0.5 * len);
        matrix_translate (matMV, 0, 0, 1.0);

        let matLook = new Array(16);
        matrix_modellookat (matLook, p0, p1, 0.0);
        matrix_mult (matMV, matLook, matMV);
    }

    render.compute_invmat3x3 (matMVI3x3, matMV);

    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_mv,  false, matMV );
    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniformMatrix3fv (render.loc_mtx_nrm, false, matMVI3x3);
    gl.uniform3f (render.loc_lightpos, 1.0, 1.0, 1.0);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_cylinder.vbo_vtx);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_cylinder.vbo_nrm);
    gl.vertexAttribPointer (render.sobj.loc_nrm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_cylinder.vbo_uv);
    gl.vertexAttribPointer (render.sobj.loc_uv,  2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, render.shape_cylinder.vbo_idx);
    gl.drawElements (gl.TRIANGLES, render.shape_cylinder.num_faces * 3, gl.UNSIGNED_SHORT, 0);

    gl.frontFace (gl.CCW);
    gl.disable (gl.BLEND);
    gl.disable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);
}


function draw_sphere (gl, mtxGlobal, p0, radius, color, is_shadow)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let matMVI3x3 = new Array( 9);

    if (!is_shadow)
        gl.enable (gl.DEPTH_TEST);

    gl.enable (gl.CULL_FACE);
    gl.frontFace (gl.CW);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );
    gl.enableVertexAttribArray (render.sobj.loc_nrm);

    matrix_identity (matMV);
    matrix_translate (matMV, p0[0], p0[1], p0[2]);
    matrix_scale     (matMV, radius, radius, radius);

    render.compute_invmat3x3 (matMVI3x3, matMV);

    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_mv,  false, matMV );
    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniformMatrix3fv (render.loc_mtx_nrm, false, matMVI3x3);
    gl.uniform3f (render.loc_lightpos, 1.0, 1.0, 1.0);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    if (color[3] < 1.0)
        gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_sphere.vbo_vtx);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_sphere.vbo_nrm);
    gl.vertexAttribPointer (render.sobj.loc_nrm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.shape_sphere.vbo_uv);
    gl.vertexAttribPointer (render.sobj.loc_uv,  2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, render.shape_sphere.vbo_idx);
    gl.drawElements (gl.TRIANGLES, render.shape_sphere.num_faces * 3, gl.UNSIGNED_SHORT, 0);

    gl.frontFace (gl.CCW);
    gl.disable (gl.BLEND);
    gl.disable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);
}


function draw_floor (gl, mtxGlobal, div_u, div_v)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let matMVI3x3 = new Array( 9);

    let floor_uv = [
          0.0,   0.0,
          0.0, div_v,
        div_u,   0.0,
        div_u, div_v,
    ];

    gl.disable (gl.DEPTH_TEST);
    gl.enable (gl.CULL_FACE);
    gl.frontFace (gl.CW);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );
    gl.disableVertexAttribArray(render.sobj.loc_nrm);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(render.s_vtx), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(floor_uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    render.compute_invmat3x3 (matMVI3x3, matMV);

    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_mv,  false, matMV );
    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniformMatrix3fv (render.loc_mtx_nrm, false, matMVI3x3);
    gl.uniform3f (render.loc_lightpos, 1.0, 2.0, 3.0);
    gl.uniform3f (render.loc_color, 0.9, 0.9, 0.9);
    gl.uniform1f (render.loc_alpha, 1.0);

    gl.disable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_floor);
    for (let i = 0; i < 6; i ++)
    {
        gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
        gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 4 * (4 * 3 * i));
        gl.vertexAttrib3f (render.sobj.loc_nrm, render.s_nrm_inv[3 * i], render.s_nrm_inv[3 * i + 1], render.s_nrm_inv[3 * i + 2]);
        gl.drawArrays (gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.disable (gl.BLEND);
    gl.frontFace (gl.CCW);
}



function draw_triangle (gl, mtxGlobal, p0, p1, p2, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let matMVI3x3 = new Array( 9);
    let floor_vtx = new Array( 9);

    for (let i = 0; i < 3; i ++)
    {
        floor_vtx[0 + i] = p0[i];
        floor_vtx[3 + i] = p1[i];
        floor_vtx[6 + i] = p2[i];
    }

    gl.enable (gl.DEPTH_TEST);
    gl.disable (gl.CULL_FACE);

    gl.useProgram (render.sobj.program);

    gl.enableVertexAttribArray (render.sobj.loc_vtx);
    gl.enableVertexAttribArray (render.sobj.loc_uv );
    gl.enableVertexAttribArray (render.sobj.loc_nrm);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(floor_vtx), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(render.s_uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    render.compute_invmat3x3 (matMVI3x3, matMV);

    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_mv,  false, matMV );
    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniformMatrix3fv (render.loc_mtx_nrm, false, matMVI3x3);
    gl.uniform3f (render.loc_lightpos, 1.0, 1.0, 1.0);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);
    gl.drawArrays (gl.TRIANGLES, 0, 3);

    gl.disable (gl.BLEND);
}

function draw_line (gl, mtxGlobal, p0, p1, color)
{
    let matMV     = new Array(16);
    let matPMV    = new Array(16);
    let matMVI3x3 = new Array( 9);
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
    gl.enableVertexAttribArray (render.sobj.loc_nrm);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(floor_vtx), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_vtx, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer (gl.ARRAY_BUFFER, render.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(render.s_uv), gl.STATIC_DRAW);
    gl.vertexAttribPointer (render.sobj.loc_uv , 2, gl.FLOAT, false, 0, 0);

    matrix_identity (matMV);
    render.compute_invmat3x3 (matMVI3x3, matMV);

    matrix_mult (matMV, mtxGlobal, matMV);
    matrix_mult (matPMV, render.matPrj, matMV);

    gl.uniformMatrix4fv (render.loc_mtx_mv,  false, matMV );
    gl.uniformMatrix4fv (render.loc_mtx_pmv, false, matPMV);
    gl.uniformMatrix3fv (render.loc_mtx_nrm, false, matMVI3x3);
    gl.uniform3f (render.loc_lightpos, 1.0, 1.0, 1.0);
    gl.uniform3f (render.loc_color, color[0], color[1], color[2]);
    gl.uniform1f (render.loc_alpha, color[3]);

    gl.enable (gl.BLEND);

    gl.bindTexture (gl.TEXTURE_2D, render.texid_dummy);
    gl.drawArrays (gl.LINES, 0, 2);

    gl.disable (gl.BLEND);
}
