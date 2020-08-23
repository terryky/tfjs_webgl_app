/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
var GLUtil = {};


GLUtil.load_file_sync = function (url) 
{
    var xhr = new XMLHttpRequest();
    xhr.open ("GET", url, false);
    xhr.send (null);
    return xhr;
}


/* ----------------------------------------------------------- *
 *   create & compile shader
 * ----------------------------------------------------------- */
GLUtil.compile_shader_text = function (gl, shader_type, text)
{
    const shader = gl.createShader (shader_type);
    gl.shaderSource (shader, text);

    gl.compileShader (shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

GLUtil.compile_shader_file = function (gl, shader_type, fname)
{
    const text = GLUtil.load_file_sync (fname).responseText;
    const shader = GLUtil.compile_shader_text (gl, shader_type, text);
    return shader;
}


/* ----------------------------------------------------------- *
 *    link shaders
 * ----------------------------------------------------------- */
GLUtil.link_shaders = function (gl, vertShader, fragShader)
{
    const program = gl.createProgram();

    gl.attachShader (program, vertShader);
    gl.attachShader (program, fragShader);

    gl.linkProgram (program);
    if (!gl.getProgramParameter (program, gl.LINK_STATUS))
    {
        alert("Could not initialise shaders");
    }
    return program;
}


GLUtil.generate_shader = function (gl, str_vs, str_fs)
{
    const vs = GLUtil.compile_shader_text (gl, gl.VERTEX_SHADER,   str_vs);
    const fs = GLUtil.compile_shader_text (gl, gl.FRAGMENT_SHADER, str_fs);
    const prog = GLUtil.link_shaders (gl, vs, fs);

    gl.deleteShader (vs);
    gl.deleteShader (fs);

    const sobj = {
        program: prog,
        loc_vtx: gl.getAttribLocation (prog, `a_Vertex`),
        loc_clr: gl.getAttribLocation (prog, `a_Color` ),
        loc_nrm: gl.getAttribLocation (prog, `a_Normal` ),
        loc_uv : gl.getAttribLocation (prog, `a_TexCoord`),
        loc_smp: gl.getUniformLocation (prog, `u_sampler`),
    };
    return sobj;
}

