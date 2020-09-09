/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */


GLUtil.create_render_target = function (gl, w, h, flag)
{
    let tex_id = 0;
    let fbo_id = 0;

    if (flag)
    {
        tex_id = gl.createTexture ();
        gl.bindTexture (gl.TEXTURE_2D, tex_id);
        gl.texImage2D (gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture (gl.TEXTURE_2D, null);

        fbo_id = gl.createFramebuffer();
    }

    let rtarget = {};
    rtarget.valid  = flag;
    rtarget.texid  = tex_id;
    rtarget.fboid  = fbo_id;
    rtarget.width  = w;
    rtarget.height = h;

    return rtarget;
}


GLUtil.destroy_render_target = function (gl, rtarget)
{
    if (!rtarget.valid)
        return;

    let texid = rtarget.texid;
    let fboid = rtarget.fboid;

    gl.deleteTexture (texid);
    gl.deleteFramebuffer (fboid);

    rtarget.texid = 0;
    rtarget.fboid = 0;
}

GLUtil.set_render_target = function (gl, rtarget)
{
    if (rtarget.valid)
    {
        gl.bindFramebuffer (gl.FRAMEBUFFER, rtarget.fboid);
        gl.framebufferTexture2D (gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtarget.texid, 0);
    }
    else
    {
        gl.bindFramebuffer (gl.FRAMEBUFFER, null);
    }

    gl.viewport (0, 0, rtarget.width, rtarget.height);
    gl.scissor  (0, 0, rtarget.width, rtarget.height);
}

