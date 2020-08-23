/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
var shapes = {};
shapes.SHAPE_TORUS        = 1;
shapes.SHAPE_MOEBIUS      = 2;
shapes.SHAPE_KLEINBOTTLE  = 3;
shapes.SHAPE_BOYSURFACE   = 4;
shapes.SHAPE_DINISURFACE  = 5;
shapes.SHAPE_SPHERE       = 6;
shapes.SHAPE_CYLINDER     = 7;


shapes.cross = function (vec1, vec2, dst)
{
    dst[0] = (vec1[1] * vec2[2]) - (vec1[2] * vec2[1]);
    dst[1] = (vec1[2] * vec2[0]) - (vec1[0] * vec2[2]);
    dst[2] = (vec1[0] * vec2[1]) - (vec1[1] * vec2[0]);
}

shapes.length = function (vec)
{
    let x2 = vec[0] * vec[0];
    let y2 = vec[1] * vec[1];
    let z2 = vec[2] * vec[2];
    return Math.sqrt(x2 + y2 + z2);
}

shapes.normalize = function (vec)
{
    let len = shapes.length(vec);
    vec[0] /= len;
    vec[1] /= len;
    vec[2] /= len;
}



shapes.get_num_faces = function (nDivU, nDivV)
{
    return (nDivU - 1) * (nDivV - 1) * 2;
}

shapes.gen_shape_buffers = function (gl, nDivU, nDivV, pshape)
{
    let bufSize = shapes.get_num_faces (nDivU, nDivV) * 3;
    pIndex = new Array(bufSize);

    pshape.vbo_vtx = gl.createBuffer();
    pshape.vbo_col = gl.createBuffer();
    pshape.vbo_nrm = gl.createBuffer();
    pshape.vbo_tng = gl.createBuffer();
    pshape.vbo_uv  = gl.createBuffer();
    pshape.vbo_idx = gl.createBuffer();

    for (let i = 0; i < nDivU - 1; i ++)
    {
        for (let j = 0; j < nDivV - 1; j ++)
        {
            let idx = (j * (nDivU - 1) + i) * 6;

            pIndex[idx + 0] = ( j ) * nDivU + ( i );
            pIndex[idx + 1] = ( j ) * nDivU + (i+1);
            pIndex[idx + 2] = (j+1) * nDivU + (i+1);
            pIndex[idx + 3] = ( j ) * nDivU + ( i );
            pIndex[idx + 4] = (j+1) * nDivU + (i+1);
            pIndex[idx + 5] = (j+1) * nDivU + ( i );
        }
    }

    gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, pshape.vbo_idx);
    gl.bufferData (gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(pIndex), gl.STATIC_DRAW);
}


shapes.generate_shape = function (gl, func, sparam)
{
    var shape = {};
    let nSampleU = sparam.nDivU;
    let nSampleV = sparam.nDivV;
    let nVertex = nSampleU * nSampleV;
    let fMinU = sparam.min_u;
    let fMinV = sparam.min_v;
    let fMaxU = sparam.max_u;
    let fMaxV = sparam.max_v;

    shapes.gen_shape_buffers (gl, nSampleU, nSampleV, shape);

    let pVertex  = new Array(nVertex * 3);
    let pColor   = new Array(nVertex * 3);
    let pNormal  = new Array(nVertex * 3);
    let pUV      = new Array(nVertex * 2);
    let pTangent = new Array(nVertex * 3);


    for (let i = 0; i < nSampleU; i ++)
    {
        for (let j = 0; j < nSampleV; j ++)
        {
            let u = fMinU + i * (fMaxU-fMinU) / (nSampleU-1);
            let v = fMinV + j * (fMaxV-fMinV) / (nSampleV-1);

            let xyz = func (u, v);

            pVertex[(j*nSampleU+i)*3 + 0] = xyz.x;
            pVertex[(j*nSampleU+i)*3 + 1] = xyz.y;
            pVertex[(j*nSampleU+i)*3 + 2] = xyz.z;
        }
    }

    for (let i = 0; i < nSampleU; i ++)
    {
        for (let j = 0; j < nSampleV; j ++)
        {
            pUV[(j*nSampleU+i)*2 + 0] = i / (nSampleU-1);
            pUV[(j*nSampleU+i)*2 + 1] = j / (nSampleV-1);
        }
    }

    for (let i = 0; i < nSampleU; i ++)
    {
        for (let j = 0; j < nSampleV; j ++)
        {
            pColor[(j*nSampleU+i)*3 + 0] =       i / (nSampleU-1);
            pColor[(j*nSampleU+i)*3 + 1] = 1.0 - i / (nSampleU-1);
            pColor[(j*nSampleU+i)*3 + 2] =       j / (nSampleV-1);
        }
    }

    for (let i = 0; i < nSampleU-1; i ++ )
    {
        for (let j = 0; j < nSampleV-1; j ++ )
        {
            var ptA = [], ptB = [], ptC = [], AB = [], AC = [], normal = [];

            ptA[0] = pVertex[(  j  *nSampleU+i  )*3+0];
            ptA[1] = pVertex[(  j  *nSampleU+i  )*3+1];
            ptA[2] = pVertex[(  j  *nSampleU+i  )*3+2];
            ptB[0] = pVertex[(  j  *nSampleU+i+1)*3+0];
            ptB[1] = pVertex[(  j  *nSampleU+i+1)*3+1];
            ptB[2] = pVertex[(  j  *nSampleU+i+1)*3+2];
            ptC[0] = pVertex[((j+1)*nSampleU+i  )*3+0];
            ptC[1] = pVertex[((j+1)*nSampleU+i  )*3+1];
            ptC[2] = pVertex[((j+1)*nSampleU+i  )*3+2];

            AB [0] = ptB[0] - ptA[0];
            AB [1] = ptB[1] - ptA[1];
            AB [2] = ptB[2] - ptA[2];
            AC [0] = ptC[0] - ptA[0];
            AC [1] = ptC[1] - ptA[1];
            AC [2] = ptC[2] - ptA[2];

            shapes.cross (AB, AC, normal);
            shapes.normalize (normal);

            pNormal[(j*nSampleU+i)*3 + 0] = -normal[0];
            pNormal[(j*nSampleU+i)*3 + 1] = -normal[1];
            pNormal[(j*nSampleU+i)*3 + 2] = -normal[2];

            shapes.normalize (AB);
            pTangent[(j*nSampleU+i)*3 + 0] = -AB[0];
            pTangent[(j*nSampleU+i)*3 + 1] = -AB[1];
            pTangent[(j*nSampleU+i)*3 + 2] = -AB[2];
        }
    }

    for (let i = 0; i < nSampleU - 1; i ++)
    {
        pNormal[((nSampleV-1)*nSampleU+i)*3+0] = pNormal[(i)*3+0];
        pNormal[((nSampleV-1)*nSampleU+i)*3+1] = pNormal[(i)*3+1];
        pNormal[((nSampleV-1)*nSampleU+i)*3+2] = pNormal[(i)*3+2];

        pTangent[((nSampleV-1)*nSampleU+i)*3+0] = pTangent[(i)*3+0];
        pTangent[((nSampleV-1)*nSampleU+i)*3+1] = pTangent[(i)*3+1];
        pTangent[((nSampleV-1)*nSampleU+i)*3+2] = pTangent[(i)*3+2];
    }

    for (let j = 0; j < nSampleV - 1; j ++)
    {
        pNormal[(j*nSampleU+nSampleU-1)*3+0] = pNormal[(j*nSampleU)*3+0];
        pNormal[(j*nSampleU+nSampleU-1)*3+1] = pNormal[(j*nSampleU)*3+1];
        pNormal[(j*nSampleU+nSampleU-1)*3+2] = pNormal[(j*nSampleU)*3+2];

        pTangent[(j*nSampleU+nSampleU-1)*3+0] = pTangent[(j*nSampleU)*3+0];
        pTangent[(j*nSampleU+nSampleU-1)*3+1] = pTangent[(j*nSampleU)*3+1];
        pTangent[(j*nSampleU+nSampleU-1)*3+2] = pTangent[(j*nSampleU)*3+2];
    }

    pNormal[((nSampleV-1)*nSampleU + (nSampleU-1))*3+0] = pNormal[((nSampleV-2)*nSampleU + (nSampleU-2))*3+0];
    pNormal[((nSampleV-1)*nSampleU + (nSampleU-1))*3+1] = pNormal[((nSampleV-2)*nSampleU + (nSampleU-2))*3+1];
    pNormal[((nSampleV-1)*nSampleU + (nSampleU-1))*3+2] = pNormal[((nSampleV-2)*nSampleU + (nSampleU-2))*3+2];

    pTangent[((nSampleV-1)*nSampleU + (nSampleU-1))*3+0]= pTangent[((nSampleV-2)*nSampleU + (nSampleU-2))*3+0];
    pTangent[((nSampleV-1)*nSampleU + (nSampleU-1))*3+1]= pTangent[((nSampleV-2)*nSampleU + (nSampleU-2))*3+1];
    pTangent[((nSampleV-1)*nSampleU + (nSampleU-1))*3+2]= pTangent[((nSampleV-2)*nSampleU + (nSampleU-2))*3+2];

    gl.bindBuffer (gl.ARRAY_BUFFER, shape.vbo_vtx);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pVertex), gl.STATIC_DRAW);

    gl.bindBuffer (gl.ARRAY_BUFFER, shape.vbo_col);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pColor), gl.STATIC_DRAW);

    gl.bindBuffer (gl.ARRAY_BUFFER, shape.vbo_uv);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pUV), gl.STATIC_DRAW);

    gl.bindBuffer (gl.ARRAY_BUFFER, shape.vbo_nrm);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pNormal), gl.STATIC_DRAW);

    gl.bindBuffer (gl.ARRAY_BUFFER, shape.vbo_tng);
    gl.bufferData (gl.ARRAY_BUFFER, new Float32Array(pTangent), gl.STATIC_DRAW);

    shape.num_faces = shapes.get_num_faces(nSampleU, nSampleV);

    return shape;
}


shapes.func_Plan = function (u, v, x, y, z)
{
    x = u;
    y = 0;
    z = v;
}

shapes.func_Torus = function (u, v)
{
    let R = 0.5, r = 2.0;
    let x = R * Math.cos(v) * (r + Math.cos(u));
    let y = R * Math.sin(v) * (r + Math.cos(u));
    let z = R * Math.sin(u);
    return {x:x, y:y, z:z};
}

shapes.func_Moebius = function (u, v)
{
    let R = 1;
    let x = R * (Math.cos(v) + u * Math.cos(v / 0.5) * Math.cos(v));
    let y = R * (Math.sin(v) + u * Math.cos(v / 0.5) * Math.sin(v));
    let z = R * u * Math.sin(v / 0.5);
    return {x:x, y:y, z:z};
}

shapes.func_KleinBottle = function (u, v)
{
    let botx = (6-2)  * Math.cos(u) * (1 + Math.sin(u));
    let boty = (16-4) * Math.sin(u);
    let rad  = (4-1)  * (1 - Math.cos(u)/2);
    let x, y, z;

    if (u > 1.7 * Math.PI)
    {
        x = botx + rad * Math.cos(u) * Math.cos(v);
        y = boty + rad * Math.sin(u) * Math.cos(v);
    }
    else if (u > Math.PI)
    {
        x = botx + rad * Math.cos(v+Math.PI);
        y = boty;
    }
    else
    {
        x = botx + rad * Math.cos(u) * Math.cos(v);
        y = boty + rad * Math.sin(u) * Math.cos(v);
    }

    z = rad * -Math.sin(v);
    y -= 2;

    x /= 10;
    y /= 10;
    z /= 10;
    return {x:x, y:y, z:z};
}

shapes.func_BoySurface = function (u, v)
{
    let a = Math.cos(u*0.5) * Math.sin(v);
    let b = Math.sin(u*0.5) * Math.sin(v);
    let c = Math.cos(v);
    let x = ((2*a*a-b*b-c*c) + 2*b*c*(b*b-c*c) + c*a*(a*a-c*c) + a*b*(b*b-a*a)) / 2;
    let y = ((b*b-c*c) + c*a*(c*c-a*a) + a*b*(b*b-a*a)) * Math.sqrt(3.0) / 2;
    let z = (a+b+c) * ((a+b+c)*(a+b+c)*(a+b+c) + 4*(b-a)*(c-b)*(a-c))/8;
    x *= 1.3;
    y *= 1.3;
    z *= 1.3;
    return {x:x, y:y, z:z};
}


shapes.func_DiniSurface = function (u, v)
{
    let x =  Math.cos(u) * Math.sin(v);
    let y = -Math.cos(v) - Math.log(Math.tan(v/2)) - 0.5 * u;
    let z = -Math.sin(u) * Math.sin(v);
    y = y * 0.3;
    return {x:x, y:y, z:z};
}

shapes.func_Sphere = function (u, v)
{
    let R = 1;
    x = R * Math.sin((0.5-v) * Math.PI);
    y = R * Math.cos((0.5-v) * Math.PI) * Math.cos(u * 2 * Math.PI);
    z = R * Math.cos((0.5-v) * Math.PI) * Math.sin(u * 2 * Math.PI);
    return {x:x, y:y, z:z};
}

shapes.func_Cylinder = function (u, v)
{
    let R = 1;
    x = R * Math.cos(u * 2 * Math.PI);
    y = R * Math.sin(u * 2 * Math.PI);
    z = R * (0.5-v) * 2;
    return {x:x, y:y, z:z};
}

/* -------------------------------------------------------------------------- *
 *  generate parametric shapes.
 * -------------------------------------------------------------------------- */
shapes.shape_create = function (gl, type, nDivU, nDivV)
{
    let func;
    let sparam = {};
    sparam.nDivU = nDivU;
    sparam.nDivV = nDivV;
    sparam.min_u = 0.0;
    sparam.max_u = 1.0;
    sparam.min_v = 0.0;
    sparam.max_v = 1.0;

    switch( type )
    {
    case shapes.SHAPE_TORUS:
        func = shapes.func_Torus;
        sparam.max_u = 2 * Math.PI;
        sparam.max_v = 2 * Math.PI;
        break;
    case shapes.SHAPE_MOEBIUS:
        func = shapes.func_Moebius;
        sparam.min_u = -Math.PI/6.0;
        sparam.max_u =  Math.PI/6.0;
        sparam.min_v = 0;
        sparam.max_v = 2 * Math.PI;
        break;
    case shapes.SHAPE_KLEINBOTTLE:
        func = shapes.func_KleinBottle;
        sparam.max_u = 2 * Math.PI;
        sparam.max_v = 2 * Math.PI;
        break;
    case shapes.SHAPE_BOYSURFACE:
        func = shapes.func_BoySurface;
        sparam.min_u = 0.001;
        sparam.max_u = Math.PI;
        sparam.min_v = 0.001;
        sparam.max_v = Math.PI;
        break;
    case shapes.SHAPE_DINISURFACE:
        func = shapes.func_DiniSurface;
        sparam.min_u = 0;
        sparam.max_u = 4 * Math.PI;
        sparam.min_v = 0.01;
        sparam.max_v = 0.5 * Math.PI;
        break;
    case shapes.SHAPE_SPHERE:
        func = shapes.func_Sphere;
        break;
    case shapes.SHAPE_CYLINDER:
        func = shapes.func_Cylinder;
        break;
    default:
        func = func_Plan;
    }

    let pshape = shapes.generate_shape (gl, func, sparam);

    return pshape;
}

