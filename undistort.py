import sys
import cv2
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
data = np.load("calibration.npz")
mtx, dist = data["mtx"], data["dist"]

img = cv2.imread(src)
h, w = img.shape[:2]
newmtx, roi = cv2.getOptimalNewCameraMatrix(mtx, dist, (w, h), 1, (w, h))
undist = cv2.undistort(img, mtx, dist, None, newmtx)
cv2.imwrite(dst, undist)
