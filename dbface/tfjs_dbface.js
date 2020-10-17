/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

const kRightEye   = 0;
const kLeftEye    = 1;
const kNose       = 2;
const kMouth      = 3;
const kRightEar   = 4;
const kFaceKeyNum = 5;

let s_detect_model;
let s_detect_tensor_input;


/* -------------------------------------------------- *
 *  Create TensorFlow.js Model
 * -------------------------------------------------- */
async function
init_tfjs_blazepose ()
{
    try {
        let url = "./model/tfjs_model/model.json";
        s_detect_model = await tf.loadGraphModel(url);
    }
    catch (e) {
        alert ("failed to load model");
        alert (e.message)
    }

    s_detect_tensor_input  = tfjs_get_tensor_by_name (s_detect_model, 0, "input");

    let det_input_w = s_detect_tensor_input.shape[2];
    let det_input_h = s_detect_tensor_input.shape[1];

    return 0;
}

function 
get_pose_detect_input_dims ()
{
    return {
        w: s_detect_tensor_input.shape[2],
        h: s_detect_tensor_input.shape[1]
    };
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Pose detection)
 * -------------------------------------------------- */
function
_exp (v)
{
    if (Math.abs (v) < 1.0)
        return v * Math.exp (1.0);

    if (v > 0.0)
        return Math.exp (v);
    else
        return -Math.exp (-v);
}

async function 
decode_bounds (region_list, logits, score_thresh, input_img_w, input_img_h)
{
    let bbox_ptr     = await logits[0].data();    /* [1, 120, 160,  4] */
    let scores_ptr   = await logits[1].data();    /* [1, 120, 160,  1] */
    let landmark_ptr = await logits[2].data();    /* [1, 120, 160, 10] */
    let score_w = logits[1].shape[2];
    let score_h = logits[1].shape[1];

    for (let y = 0; y < score_h; y ++)
    {
        for (let x = 0; x < score_w; x ++)
        {
            let region = {};
            let idx = y * score_w + x;
            let score = scores_ptr[idx];

            if (score < score_thresh)
                continue;

            let bx = bbox_ptr[4 * idx + 0];
            let by = bbox_ptr[4 * idx + 1];
            let bw = bbox_ptr[4 * idx + 2];
            let bh = bbox_ptr[4 * idx + 3];

            let topleft = {}, btmright = {};
            topleft.x  = (x - bx) / score_w;
            topleft.y  = (y - by) / score_h;
            btmright.x = (x + bw) / score_w;
            btmright.y = (y + bh) / score_h;

            region.score    = score;
            region.topleft  = topleft;
            region.btmright = btmright;

            let keys = new Array(kFaceKeyNum);
            for (let i = 0; i < kFaceKeyNum; i ++)
            {
                let lmidx = 2 * kFaceKeyNum * idx + i;
                let lx = landmark_ptr[lmidx              ] * 4;
                let ly = landmark_ptr[lmidx + kFaceKeyNum] * 4;
                lx = (_exp(lx) + x) / score_w;
                ly = (_exp(ly) + y) / score_h;

                keys[i] = {x: lx, y: ly};
            }
            region.keys = keys;
            region_list.push (region);
        }
    }
    return 0;
}


function
sort_right_major (v1, v2)
{
    if (v1.keys[kRightEye].x > v2.keys[kRightEye].x)
        return 1;
    else
        return -1;
}

/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Pose detection)
 * -------------------------------------------------- */
function exec_tfjs (img)
{
    let w = s_detect_tensor_input.shape[2];
    let h = s_detect_tensor_input.shape[1];

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

        return s_detect_model.predict(batched);
    });

    return out_tensors;
}

async function invoke_pose_detect (img, config)
{
    let out_tensors = exec_tfjs (img);

    let score_thresh = config.detect_thresh;
    let nms_enable   = config.detect_nms_enable;
    let iou_thresh   = config.detect_iou_thresh;
    let region_list = [];
    let w = s_detect_tensor_input.shape[2];
    let h = s_detect_tensor_input.shape[1];

    if (score_thresh < 0.01)
        score_thresh = 0.01
    await decode_bounds (region_list, out_tensors, score_thresh, w, h);

    if (nms_enable) /* USE NMS */
    {
        let region_nms_list = [];
        non_max_suppression (region_list, region_nms_list, iou_thresh);
        region_list = region_nms_list;
    }

    region_list.sort (sort_right_major);

    /* release the resource of output tensor */
    for (let i = 0; i < out_tensors.length; i ++)
        out_tensors[i].dispose();

    return region_list;
}
