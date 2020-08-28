/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */
let s_model;
let s_tensor_input;
let s_tensor_output;


/* -------------------------------------------------- *
 *  Create TensorFlow.js Model
 * -------------------------------------------------- */
async function init_tfjs_classification ()
{
    try {
        if (false)
        {
            let url = "https://tfhub.dev/google/imagenet/mobilenet_v1_100_224/classification/1"
            s_model = await tf.loadGraphModel (url, {fromTFHub: true});
        }
        else
        {
            let url = "./model/model.json";
            s_model = await tf.loadGraphModel(url);
        }
    }
    catch (e) {
        alert ("failed to load model");
        alert (e.message)
    }

    s_tensor_input  = tfjs_get_tensor_by_name (s_model, 0, "images");
    s_tensor_output = tfjs_get_tensor_by_name (s_model, 1, "module_apply_default/MobilenetV1/Logits/SpatialSqueeze");
}



/* -------------------------------------------------- *
 * Invoke TensorFlow.js
 * -------------------------------------------------- */
async function getTopKClasses (logits, topK)
{
    const softmax = logits.softmax();
    const values  = await softmax.data();
    softmax.dispose();

    const valuesAndIndices = [];
    for (let i = 0; i < values.length; i++) 
    {
        valuesAndIndices.push({value: values[i], index: i});
    }
    valuesAndIndices.sort((a, b) => {
        return b.value - a.value;
    });
    
    const topkValues  = new Float32Array(topK);
    const topkIndices = new Int32Array(topK);
    for (let i = 0; i < topK; i++) 
    {
        topkValues[i]  = valuesAndIndices[i].value;
        topkIndices[i] = valuesAndIndices[i].index;
    }

    const topClassesAndProbs = [];
    for (let i = 0; i < topkIndices.length; i++)
    {
        topClassesAndProbs.push({
            index      : topkIndices[i],
            class_name : IMAGENET_CLASSES[topkIndices[i]].name,
            probability: topkValues[i]
        });
    }
    return topClassesAndProbs;
}


function exec_tfjs (img)
{
    let logits = tf.tidy(() =>
    {
        img = tf.browser.fromPixels(img);

        // normalize [0, 255] to [0, 1].
        let min = 0;
        let max = 1;
        normalized = img.toFloat().mul((max - min)/255.0).add(min);

        // resize, reshape
        let resized = tf.image.resizeBilinear(normalized, [224, 224], true);
        let batched = resized.reshape([-1, 224, 224, 3]);

        let logits;
        if (false)
        {
            const name = "module_apply_default/MobilenetV1/Logits/SpatialSqueeze";
            logits = s_model.execute(batched, name);
        }
        else
        {
            logits = s_model.predict(batched);
        }

        // Remove the very first logit
        logits = logits.slice([0, 1], [-1, 1000]);

        return logits;
    });

    return logits;
}

async function invoke_classification (img)
{
    let topn = 5;

    let logits  = exec_tfjs (img);
    let classes = await getTopKClasses (logits, topn);

    /* release the resource of output tensor */
    logits.dispose ();

    return classes;
}

