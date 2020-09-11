/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

const kPoseKeyNum = 19;

let s_detect_model;
let s_tensor_input;
let s_tensor_heatmap;
let s_tensor_offsets;

let s_hmp_w = 0;
let s_hmp_h = 0;


/* -------------------------------------------------- *
 *  Create TensorFlow.js Model
 * -------------------------------------------------- */
async function
init_tfjs_pose3d ()
{
    try {
        let url = "./model/model.json";
        s_detect_model = await tf.loadGraphModel(url);
    }
    catch (e) {
        alert ("failed to load model");
        alert (e.message)
    }

    s_tensor_input   = tfjs_get_tensor_by_name (s_detect_model, 0, "data");        /* (1, 256, 448,  3) */
    s_tensor_offsets = tfjs_get_tensor_by_name (s_detect_model, 1, "Identity");    /* (1,  32,  56, 57) */
    s_tensor_heatmap = tfjs_get_tensor_by_name (s_detect_model, 1, "Identity_1");  /* (1,  32,  56, 19) */

    return 0;
}

function 
get_pose3d_input_dims ()
{
    return {
        w: s_tensor_input.shape[2],
        h: s_tensor_input.shape[1]
    };
}


/*
 *  these post process are based on:
 *      https://github.com/openvinotoolkit/open_model_zoo/blob/master/demos/python_demos/human_pose_estimation_3d_demo/modules/parse_poses.py
 */
function
get_heatmap_score (heatmap_ptr, idx_y, idx_x, key_id)
{
    let idx = (idx_y * s_hmp_w * kPoseKeyNum) + (idx_x * kPoseKeyNum) + key_id;
    return heatmap_ptr[idx];
}

function
get_offset_vector (offsets_ptr, ofst3d, idx_y, idx_x, pose_id_)
{
    let map_id_to_panoptic = [1, 0, 9, 10, 11, 3, 4, 5, 12, 13, 14, 6, 7, 8, 15, 16, 17, 18, 2];
    let pose_id = map_id_to_panoptic[pose_id_];

    let idx0 = (idx_y * s_hmp_w * kPoseKeyNum*3) + (idx_x * kPoseKeyNum*3) + (3 * pose_id + 0);
    let idx1 = (idx_y * s_hmp_w * kPoseKeyNum*3) + (idx_x * kPoseKeyNum*3) + (3 * pose_id + 1);
    let idx2 = (idx_y * s_hmp_w * kPoseKeyNum*3) + (idx_x * kPoseKeyNum*3) + (3 * pose_id + 2);

    ofst3d.x = offsets_ptr[idx0];
    ofst3d.y = offsets_ptr[idx1];
    ofst3d.z = offsets_ptr[idx2];
}

function
get_index_to_pos (offsets_ptr, idx_x, idx_y, key_id, pos2d, pos3d)
{
    /* pos 2D */
    pos2d.x = idx_x / (s_hmp_w -1);
    pos2d.y = idx_y / (s_hmp_h -1);

    /* pos 3D */
    get_offset_vector (offsets_ptr, pos3d, idx_y, idx_x, key_id);
}


async function 
decode_single_pose (pose_list, out_tensors, input_img_w, input_img_h)
{
    let tensor_offsets = out_tensors[0]; /* (1,  32,  56, 57) */
    let tensor_heatmap = out_tensors[1]; /* (1,  32,  56, 19) */
    s_hmp_w = tensor_heatmap.shape[2];
    s_hmp_h = tensor_heatmap.shape[1];

    let scores_ptr = await tensor_heatmap.data();
    let bbox_ptr   = await tensor_offsets.data();
    
    let max_block_idx = [];
    let max_block_cnf = [];

    /* find the highest heatmap block for each key */
    for (let i = 0; i < kPoseKeyNum; i ++)
    {
        let max_confidence = -Number.MAX_VALUE;
        for (let y = 0; y < s_hmp_h; y ++)
        {
            for (let x = 0; x < s_hmp_w; x ++)
            {
                let confidence = get_heatmap_score (scores_ptr, y, x, i);
                if (confidence > max_confidence)
                {
                    max_confidence = confidence;
                    max_block_cnf[i] = confidence;
                    max_block_idx[i] = {x:x, y:y};
                }
            }
        }
    }

    let pose = {};
    pose.key   = new Array(kPoseKeyNum);
    pose.key3d = new Array(kPoseKeyNum);

    /* find the offset vector and calculate the keypoint coordinates. */
    for (let i = 0; i < kPoseKeyNum;i ++ )
    {
        let idx_x = max_block_idx[i].x;
        let idx_y = max_block_idx[i].y;
        let pos2d = {x:0.0, y:0.0};
        let pos3d = {x:0.0, y:0.0, z:0.0};
        get_index_to_pos (bbox_ptr, idx_x, idx_y, i, pos2d, pos3d);

        pose.key  [i] = {x: pos2d.x, y: pos2d.y, score: max_block_cnf[i]};
        pose.key3d[i] = {x: pos3d.x, y: pos3d.y, z: pos3d.z, score: max_block_cnf[i]};
    }

    pose.pose_score = 1.0;
    pose_list.push (pose);
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Pose detection)
 * -------------------------------------------------- */
function exec_tfjs (img)
{
    let w = s_tensor_input.shape[2];
    let h = s_tensor_input.shape[1];

    let out_tensors = tf.tidy(() =>
    {
        img_tensor1d = tf.tensor1d(img);
        img_tensor = img_tensor1d.reshape([h, w, 3]);

        // normalize [0, 255] to [0, 1].
        let min =  0;
        let max =  1;
        let normalized = img_tensor.toFloat().mul((max - min)/255.0).add(min);

        // resize, reshape
        let batched = normalized.reshape([-1, h, w, 3]);

        return s_detect_model.predict(batched);
    });

    return out_tensors;
}

async function invoke_pose_detect (img)
{
    let out_tensors = exec_tfjs (img);

    let pose_list = [];
    let w = s_tensor_input.shape[2];
    let h = s_tensor_input.shape[1];

    /* currently, decoding of multiple poses is not implemented. */
    //let score_thresh = 0.75;
    //await decode_multiple_poses (pose_list, out_tensors, score_thresh, w, h);

    await decode_single_pose (pose_list, out_tensors, w, h);

    /* release the resource of output tensor */
    for (let i = 0; i < out_tensors.length; i ++)
        out_tensors[i].dispose();

    return pose_list;
}

