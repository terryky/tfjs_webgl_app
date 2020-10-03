/* ------------------------------------------------ *
 * The MIT License (MIT)
 * Copyright (c) 2020 terryky1220@gmail.com
 * ------------------------------------------------ */

const kRightEye      = 0;
const kLeftEye       = 1;
const kNose          = 2;
const kMouth         = 3;
const kRightEar      = 4;
const kLeftEar       = 5;
const kFaceKeyNum    = 6;

let s_detect_model;
let s_detect_tensor_input;

let s_segment_model;
let s_segment_tensor_input;

let s_anchors = [];

function
create_ssd_anchors(input_w, input_h)
{
    /*
     *  Anchor parameters are based on:
     *      mediapipe/modules/pose_detection/pose_detection_cpu.pbtxt
     */
    let anchor_options = {};
    anchor_options.strides = [];
    anchor_options.aspect_ratios = [];
    anchor_options.feature_map_height = [];

    anchor_options.num_layers = 4;
    anchor_options.min_scale = 0.1484375;
    anchor_options.max_scale = 0.75;
    anchor_options.input_size_height = 128;
    anchor_options.input_size_width  = 128;
    anchor_options.anchor_offset_x  = 0.5;
    anchor_options.anchor_offset_y  = 0.5;
//  anchor_options.feature_map_width .push(0);
//  anchor_options.feature_map_height.push(0);
    anchor_options.strides.push( 8);
    anchor_options.strides.push(16);
    anchor_options.strides.push(16);
    anchor_options.strides.push(16);
    anchor_options.aspect_ratios.push(1.0);
    anchor_options.reduce_boxes_in_lowest_layer = false;
    anchor_options.interpolated_scale_aspect_ratio = 1.0;
    anchor_options.fixed_anchor_size = true;

    GenerateAnchors (s_anchors, anchor_options);
}



/* -------------------------------------------------- *
 *  Create TensorFlow.js Model
 * -------------------------------------------------- */
async function
init_tfjs_face_segmentation ()
{
    try {
        let url = "./model/tfjs_model_face_detection_front/model.json";
        s_detect_model = await tf.loadGraphModel(url);

        let url_segment = "./model/tfjs_model_bisenetv2_celebamaskhq_256x256_float32/model.json";
        s_segment_model = await tf.loadGraphModel(url_segment);
    }
    catch (e) {
        alert ("failed to load model");
        alert (e.message)
    }

    /* face detect */
    s_detect_tensor_input  = tfjs_get_tensor_by_name (s_detect_model, 0, "input");

    /* face segmentation */
    s_segment_tensor_input = tfjs_get_tensor_by_name (s_segment_model, 0, "input_tensor");

    let det_input_w = s_detect_tensor_input.shape[2];
    let det_input_h = s_detect_tensor_input.shape[1];
    create_ssd_anchors (det_input_w, det_input_h);

    return 0;
}

function 
get_face_detect_input_dims ()
{
    return {
        w: s_detect_tensor_input.shape[2],
        h: s_detect_tensor_input.shape[1]
    };
}

function 
get_face_segment_input_dims ()
{
    return {
        w: s_segment_tensor_input.shape[2],
        h: s_segment_tensor_input.shape[1]
    };
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Face detection)
 * -------------------------------------------------- */
async function 
decode_bounds (region_list, logits, score_thresh, input_img_w, input_img_h)
{
    let scores_ptr0 = await logits[3].data();   /* [3] 1, 512,  1 */
    let bbox_ptr0   = await logits[1].data();   /* [1] 1, 512, 16 */
    let scores_ptr1 = await logits[0].data();   /* [0] 1, 384,  1 */
    let bbox_ptr1   = await logits[2].data();   /* [2] 1, 384, 16 */

    for (let i = 0; i < s_anchors.length; i ++)
    {
        let region = {};
        let anchor = s_anchors[i];
        let anchor_idx;

        let bbox_ptr;
        let scores_ptr;
        if (i < 512)
        {
            scores_ptr = scores_ptr0;
            bbox_ptr = bbox_ptr0;
            anchor_idx = i;
        }
        else
        {
            scores_ptr = scores_ptr1;
            bbox_ptr = bbox_ptr1;
            anchor_idx = i - 512;
        }

        let score0 = scores_ptr[anchor_idx];
        let score = 1.0 / (1.0 + Math.exp(-score0));

        if (score > score_thresh)
        {
            /*
             *  cx, cy, width, height
             *  key0_x, key0_y
             *  key._x, keyx_y
             *  key5_x, key5_y
             */
            let numkey = kFaceKeyNum;
            let bbx_idx = (4 + 2 * numkey) * anchor_idx;

            /* boundary box */
            let sx = bbox_ptr[bbx_idx + 0];
            let sy = bbox_ptr[bbx_idx + 1];
            let w  = bbox_ptr[bbx_idx + 2];
            let h  = bbox_ptr[bbx_idx + 3];

            let cx = sx + anchor.x_center * input_img_w;
            let cy = sy + anchor.y_center * input_img_h;

            cx /= input_img_w;
            cy /= input_img_h;
            w  /= input_img_w;
            h  /= input_img_h;

            let topleft = {}, btmright = {};
            topleft.x  = cx - w * 0.5;
            topleft.y  = cy - h * 0.5;
            btmright.x = cx + w * 0.5;
            btmright.y = cy + h * 0.5;

            region.score    = score;
            region.topleft  = topleft;
            region.btmright = btmright;

            /* landmark positions (6 keys) */
            let keys = new Array(kFaceKeyNum);
            for (let j = 0; j < kFaceKeyNum; j ++)
            {
                let lx = bbox_ptr[bbx_idx + 4 + (2 * j) + 0];
                let ly = bbox_ptr[bbx_idx + 4 + (2 * j) + 1];
                lx += anchor.x_center * input_img_w;
                ly += anchor.y_center * input_img_h;
                lx /= input_img_w;
                ly /= input_img_h;

                keys[j] = {x: lx, y: ly};
            }
            region.keys = keys;

            region_list.push (region);
        }
    }
    return 0;
}




/* -------------------------------------------------- *
 *  extract ROI
 *  based on:
 *   - mediapipe/calculators/util/alignment_points_to_rects_calculator.cc
 *       AlignmentPointsRectsCalculator::DetectionToNormalizedRect()
 *   - mediapipe\calculators\util\rect_transformation_calculator.cc
 *       RectTransformationCalculator::TransformNormalizedRect()
 * -------------------------------------------------- */
function
normalize_radians (angle)
{
    return angle - 2 * Math.PI * Math.floor((angle - (-Math.PI)) / (2 * Math.PI));
}

function
compute_rotation (region)
{
    let x0 = region.keys[kRightEye].x;
    let y0 = region.keys[kRightEye].y;
    let x1 = region.keys[kLeftEye].x;
    let y1 = region.keys[kLeftEye].y;

    let target_angle = 0;//Math.PI * 0.5;
    let rotation = target_angle - Math.atan2(-(y1 - y0), x1 - x0);

    region.rotation = normalize_radians (rotation);
}

function
rot_vec (vec, rotation)
{
    let sx = vec.x;
    let sy = vec.y;
    vec.x = sx * Math.cos(rotation) - sy * Math.sin(rotation);
    vec.y = sx * Math.sin(rotation) + sy * Math.cos(rotation);
}

function
compute_detect_to_roi (region)
{
    let input_img_w = s_detect_tensor_input.shape[2];
    let input_img_h = s_detect_tensor_input.shape[1];
    let width    = region.btmright.x - region.topleft.x;
    let height   = region.btmright.y - region.topleft.y;
    let x_center = region.topleft.x + width  * 0.5;
    let y_center = region.topleft.y + height * 0.5;
    let rotation = region.rotation;
    let shift_x =  0.0;
    let shift_y = -0.3;
    let roi_cx;
    let roi_cy;

    if (rotation == 0.0)
    {
        roi_cx = x_center + (width  * shift_x);
        roi_cy = y_center + (height * shift_y);
    }
    else
    {
        let dx = (width  * shift_x) * Math.cos(rotation) -
                 (height * shift_y) * Math.sin(rotation);
        let dy = (width  * shift_x) * Math.sin(rotation) +
                 (height * shift_y) * Math.cos(rotation);
        roi_cx = x_center + dx;
        roi_cy = y_center + dy;
    }

    /*
     *  calculate ROI width and height.
     *  scale parameter is based on
     *      "mediapipe/modules/pose_landmark/pose_detection_to_roi.pbtxt"
     */
    let scale_x = 1.8;
    let scale_y = 1.8;
    let long_side = Math.max (width, height);
    let roi_w = long_side * scale_x;
    let roi_h = long_side * scale_y;

    region.roi_center = {x: roi_cx, y: roi_cy};
    region.roi_size   = {x: roi_w,  y: roi_h };

    /* calculate ROI coordinates */
    let dx = roi_w * 0.5;
    let dy = roi_h * 0.5;
    region.roi_coord = [];
    region.roi_coord[0] = {x: - dx, y: - dy};
    region.roi_coord[1] = {x: + dx, y: - dy};
    region.roi_coord[2] = {x: + dx, y: + dy};
    region.roi_coord[3] = {x: - dx, y: + dy};

    for (let i = 0; i < 4; i ++)
    {
        rot_vec (region.roi_coord[i], rotation);
        region.roi_coord[i].x += roi_cx;
        region.roi_coord[i].y += roi_cy;
    }
}


function pack_detect_result (detect_result, region_list)
{
    for (let i = 0; i < region_list.length; i ++)
    {
        region = region_list[i];

        compute_rotation (region);
        compute_detect_to_roi (region);

        detect_result.push (region);
    }
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Face detection)
 * -------------------------------------------------- */
function exec_tfjs (img)
{
    let w = s_detect_tensor_input.shape[2];
    let h = s_detect_tensor_input.shape[1];

    let out_tensors = tf.tidy(() =>
    {
        img_tensor1d = tf.tensor1d(img);
        img_tensor = img_tensor1d.reshape([h, w, 3]);

        // normalize [0, 255] to [0, 1].
        let min = 0;
        let max = 1;
        let normalized = img_tensor.toFloat().mul((max - min)/255.0).add(min);

        // resize, reshape
        let batched = normalized.reshape([-1, w, h, 3]);

        return s_detect_model.predict(batched);
    });

    return out_tensors;
}

async function invoke_pose_detect (img)
{
    let out_tensors  = exec_tfjs (img);

    let score_thresh = 0.75;
    let detect_result = [];
    let region_list = [];
    let w = s_detect_tensor_input.shape[2];
    let h = s_detect_tensor_input.shape[1];
    await decode_bounds (region_list, out_tensors, score_thresh, w, h);

    if (true) /* USE NMS */
    {
        let iou_thresh = 0.3;
        let region_nms_list = [];

        non_max_suppression (region_list, region_nms_list, iou_thresh);
        pack_detect_result (detect_result, region_nms_list);
    }
    else
    {
        pack_detect_result (detect_result, region_list);
    }

    /* release the resource of output tensor */
    for (let i = 0; i < out_tensors.length; i ++)
        out_tensors[i].dispose();

    return detect_result;
}


/* -------------------------------------------------- *
 * Invoke TensorFlow.js (Face segmentation)
 * -------------------------------------------------- */
function exec_tfjs_segmentation (img)
{
    let w = s_segment_tensor_input.shape[2];
    let h = s_segment_tensor_input.shape[1];

    let out_tensors = tf.tidy(() =>
    {
        img_tensor1d = tf.tensor1d(img);
        img_tensor = img_tensor1d.reshape([h, w, 3]);

        // normalize [0, 255] to [0, 1].
        let min = 0;
        let max = 1;
        let normalized = img_tensor.toFloat().mul((max - min)/255.0).add(min);

        // resize, reshape
        let batched = normalized.reshape([-1, w, h, 3]);

        return s_segment_model.predict(batched);
    });

    return out_tensors;
}



async function 
invoke_face_segmentation (img)
{
    let out_tensors = exec_tfjs_segmentation (img);

    let poseflag_ptr = await out_tensors.data();
    let w = s_segment_tensor_input.shape[2];
    let h = s_segment_tensor_input.shape[1];

    let segmentation_result = [];
    segmentation_result.segmentmap = poseflag_ptr.slice (); /* copy array data */
    segmentation_result.segmentmap_dims = [w, h];

    /* release the resource of output tensor */
    out_tensors.dispose ();

    return segmentation_result;
}

