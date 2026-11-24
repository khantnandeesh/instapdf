//! 2D affine matrices in PDF order `[a b c d e f]` (row vectors, `p' = p × M`).

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Matrix(pub [f64; 6]);

impl Matrix {
    pub const IDENTITY: Matrix = Matrix([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

    pub fn translate(tx: f64, ty: f64) -> Matrix {
        Matrix([1.0, 0.0, 0.0, 1.0, tx, ty])
    }

    /// `self × other`: apply `self` first, then `other`.
    pub fn then(&self, o: &Matrix) -> Matrix {
        let [a, b, c, d, e, f] = self.0;
        let [a2, b2, c2, d2, e2, f2] = o.0;
        Matrix([a * a2 + b * c2, a * b2 + b * d2, c * a2 + d * c2, c * b2 + d * d2, e * a2 + f * c2 + e2, e * b2 + f * d2 + f2])
    }

    pub fn apply(&self, x: f64, y: f64) -> (f64, f64) {
        let [a, b, c, d, e, f] = self.0;
        (x * a + y * c + e, x * b + y * d + f)
    }

    /// Length of the transformed x unit vector.
    pub fn x_scale(&self) -> f64 {
        self.0[0].hypot(self.0[1])
    }

    /// Length of the transformed y unit vector.
    pub fn y_scale(&self) -> f64 {
        self.0[2].hypot(self.0[3])
    }

    /// Direction of the transformed x axis in radians.
    pub fn x_angle(&self) -> f64 {
        self.0[1].atan2(self.0[0])
    }
}

/// Axis-aligned rectangle in page space, `[x0, y0, x1, y1]` with `x0 <= x1`, `y0 <= y1`.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct Rect {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

impl Rect {
    pub fn from_points(pts: &[(f64, f64)]) -> Rect {
        let mut r = Rect { x0: f64::INFINITY, y0: f64::INFINITY, x1: f64::NEG_INFINITY, y1: f64::NEG_INFINITY };
        for &(x, y) in pts {
            r.x0 = r.x0.min(x);
            r.y0 = r.y0.min(y);
            r.x1 = r.x1.max(x);
            r.y1 = r.y1.max(y);
        }
        r
    }

    pub fn union(&self, o: &Rect) -> Rect {
        Rect { x0: self.x0.min(o.x0), y0: self.y0.min(o.y0), x1: self.x1.max(o.x1), y1: self.y1.max(o.y1) }
    }
}
