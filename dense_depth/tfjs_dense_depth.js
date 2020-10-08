/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
let s_depth_model;
let s_depth_tensor_input;

/* -------------------------------------------------- *
 *  Create TensorFlow.js Model
 * -------------------------------------------------- */
async function
init_tfjs_dense_depth ()
{
    try {
        let url = "./model/nyu/tfjs_model_480x640_float32/model.json";
        s_depth_model = await tf.loadGraphModel(url);
    }
    catch (e) {
        alert ("failed to load model");
        alert (e.message)
    }

    s_depth_tensor_input = tfjs_get_tensor_by_name (s_depth_model, 0, "input_1");

    return 0;
}

function 
get_dense_depth_input_dims ()
{
    return {
        w: s_depth_tensor_input.shape[2],
        h: s_depth_tensor_input.shape[1]
    };
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Dense Depth estimation)
 * -------------------------------------------------- */
function exec_tfjs_dense_depth (img)
{
    let w = s_depth_tensor_input.shape[2];
    let h = s_depth_tensor_input.shape[1];

    let out_tensors = tf.tidy(() =>
    {
        img_tensor1d = tf.tensor1d(img);
        img_tensor = img_tensor1d.reshape([h, w, 3]);

        // normalize [0, 255] to [-1, 1].
        let min = -1;
        let max =  1;
        let normalized = img_tensor.toFloat().mul((max - min)/255.0).add(min);

        // resize, reshape
        let batched = normalized.reshape([-1, h, w, 3]);

        return s_depth_model.predict(batched);
    });

    return out_tensors;
}

async function 
invoke_dense_depth (img)
{
    let out_tensors = exec_tfjs_dense_depth (img);

    let depth_ptr = await out_tensors.data();
    let w = out_tensors.shape[2];
    let h = out_tensors.shape[1];

    let dense_depth_result = [];
    dense_depth_result.depthmap = depth_ptr.slice (); /* copy array data */
    dense_depth_result.depthmap_dims = [w, h];

    /* release the resource of output tensor */
    out_tensors.dispose ();

    return dense_depth_result;
}

