// matrix4.js
export class Matrix4 {
    constructor() {
        this.elements = new Float32Array(16);
        this.identity();
    }

    identity() {
        const e = this.elements;
        e[0] = 1;  e[4] = 0;  e[8]  = 0;  e[12] = 0;
        e[1] = 0;  e[5] = 1;  e[9]  = 0;  e[13] = 0;
        e[2] = 0;  e[6] = 0;  e[10] = 1;  e[14] = 0;
        e[3] = 0;  e[7] = 0;  e[11] = 0;  e[15] = 1;
        return this;
    }

    perspective(fovY, aspect, near, far) {
        const f = 1.0 / Math.tan(fovY / 2);
        const nf = 1 / (near - far);
        
        const e = this.elements;
        e[0] = f / aspect;
        e[1] = 0;
        e[2] = 0;
        e[3] = 0;
        e[4] = 0;
        e[5] = f;
        e[6] = 0;
        e[7] = 0;
        e[8] = 0;
        e[9] = 0;
        e[10] = (far + near) * nf;
        e[11] = -1;
        e[12] = 0;
        e[13] = 0;
        e[14] = 2 * far * near * nf;
        e[15] = 0;
        return this;
    }

    ortho(left, right, bottom, top, near, far) {
        const e = this.elements;
        const w = right - left;
        const h = top - bottom;
        const d = far - near;

        e[0] = 2 / w;
        e[4] = 0;
        e[8] = 0;
        e[12] = -(right + left) / w;
        
        e[1] = 0;
        e[5] = 2 / h;
        e[9] = 0;
        e[13] = -(top + bottom) / h;
        
        e[2] = 0;
        e[6] = 0;
        e[10] = -2 / d;
        e[14] = -(far + near) / d;
        
        e[3] = 0;
        e[7] = 0;
        e[11] = 0;
        e[15] = 1;

        return this;
    }

    multiply(m) {
        const e = this.elements;
        const a = this.elements;
        const b = m.elements;

        const a11 = a[0], a12 = a[4], a13 = a[8],  a14 = a[12];
        const a21 = a[1], a22 = a[5], a23 = a[9],  a24 = a[13];
        const a31 = a[2], a32 = a[6], a33 = a[10], a34 = a[14];
        const a41 = a[3], a42 = a[7], a43 = a[11], a44 = a[15];

        const b11 = b[0], b12 = b[4], b13 = b[8],  b14 = b[12];
        const b21 = b[1], b22 = b[5], b23 = b[9],  b24 = b[13];
        const b31 = b[2], b32 = b[6], b33 = b[10], b34 = b[14];
        const b41 = b[3], b42 = b[7], b43 = b[11], b44 = b[15];

        e[0]  = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        e[4]  = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        e[8]  = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        e[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

        e[1]  = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        e[5]  = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        e[9]  = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        e[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

        e[2]  = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        e[6]  = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        e[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        e[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

        e[3]  = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        e[7]  = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        e[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        e[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

        return this;
    }

    translate(x, y, z) {
        const e = this.elements;
        e[12] += e[0] * x + e[4] * y + e[8]  * z;
        e[13] += e[1] * x + e[5] * y + e[9]  * z;
        e[14] += e[2] * x + e[6] * y + e[10] * z;
        e[15] += e[3] * x + e[7] * y + e[11] * z;
        return this;
    }

    scale(x, y, z) {
        const e = this.elements;
        e[0] *= x;  e[4] *= y;  e[8]  *= z;
        e[1] *= x;  e[5] *= y;  e[9]  *= z;
        e[2] *= x;  e[6] *= y;  e[10] *= z;
        e[3] *= x;  e[7] *= y;  e[11] *= z;
        return this;
    }
}