/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

function tfjs_get_tensor_by_name (model, io, name)
{
    let tensors;
    if (io == 0)
        tensors = model.inputs;
    else
        tensors = model.outputs;

    let ptensor;
    for (let i = 0; i < tensors.length; i ++)
    {
        if (tensors[i].name == name)
        {
            ptensor = tensors[i];
            break;
        }
    }

    return ptensor;
}

