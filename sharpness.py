import sys, cv2

img = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE)
if img is None:
    print("0")
    sys.exit()

var = cv2.Laplacian(img, cv2.CV_64F).var()

pct = min(100, round(var / 10))
print(pct)
