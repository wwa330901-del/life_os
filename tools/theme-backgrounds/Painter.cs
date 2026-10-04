using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// 元序風格背景：程序化「寫實但不是照片」的淡化風景。
public class Painter
{
    public int W, H;
    double[] px;
    Random rng;

    public Painter(int w, int h, int seed) { W = w; H = h; px = new double[w * h * 3]; rng = new Random(seed); }

    // ---------- noise ----------
    static double Hash(int x, int y, int s)
    {
        unchecked
        {
            int n = x * 374761393 + y * 668265263 + s * 982451653;
            n = (n ^ (n >> 13)) * 1274126177;
            n = n ^ (n >> 16);
            return (n & 0x7fffffff) / (double)0x7fffffff;
        }
    }
    static double Smooth(double t) { return t * t * (3 - 2 * t); }
    public static double Noise(double x, double y, int s)
    {
        int xi = (int)Math.Floor(x), yi = (int)Math.Floor(y);
        double xf = x - xi, yf = y - yi;
        double a = Hash(xi, yi, s), b = Hash(xi + 1, yi, s), c = Hash(xi, yi + 1, s), d = Hash(xi + 1, yi + 1, s);
        double u = Smooth(xf), v = Smooth(yf);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    public static double Fbm(double x, double y, int s, int oct, double pers)
    {
        double sum = 0, amp = 1, norm = 0, f = 1;
        for (int i = 0; i < oct; i++) { sum += amp * Noise(x * f, y * f, s + i * 17); norm += amp; amp *= pers; f *= 2; }
        return sum / norm;
    }

    // ---------- helpers ----------
    static double[] C(string hex)
    {
        hex = hex.TrimStart('#');
        return new double[] { Convert.ToInt32(hex.Substring(0, 2), 16) / 255.0, Convert.ToInt32(hex.Substring(2, 2), 16) / 255.0, Convert.ToInt32(hex.Substring(4, 2), 16) / 255.0 };
    }
    static double Clamp(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    void Blend(int x, int y, double[] c, double a)
    {
        if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
        if (a > 1) a = 1;
        int i = (y * W + x) * 3;
        px[i] += (c[0] - px[i]) * a; px[i + 1] += (c[1] - px[i + 1]) * a; px[i + 2] += (c[2] - px[i + 2]) * a;
    }
    void Add(int x, int y, double[] c, double a)
    {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        int i = (y * W + x) * 3;
        px[i] = Clamp(px[i] + c[0] * a); px[i + 1] = Clamp(px[i + 1] + c[1] * a); px[i + 2] = Clamp(px[i + 2] + c[2] * a);
    }

    // ---------- layers ----------
    public void Sky(string top, string mid, string bottom, double midAt)
    {
        double[] t = C(top), m = C(mid), b = C(bottom);
        for (int y = 0; y < H; y++)
        {
            double k = y / (double)(H - 1);
            double[] c = new double[3];
            for (int j = 0; j < 3; j++)
                c[j] = k < midAt ? t[j] + (m[j] - t[j]) * (k / midAt) : m[j] + (b[j] - m[j]) * ((k - midAt) / (1 - midAt));
            for (int x = 0; x < W; x++) { int i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; }
        }
    }

    public void Glow(double cx, double cy, double r, string hex, double strength)
    {
        double[] c = C(hex);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            double dx = (x - cx * W) / (r * W), dy = (y - cy * H) / (r * W);
            double a = Math.Exp(-(dx * dx + dy * dy)) * strength;
            if (a > 0.002) Blend(x, y, c, a);
        }
    }

    public void Disc(double cx, double cy, double r, string hex, double alpha)
    {
        double[] c = C(hex);
        double R = r * W;
        for (int y = (int)(cy * H - R - 2); y <= cy * H + R + 2; y++) for (int x = (int)(cx * W - R - 2); x <= cx * W + R + 2; x++)
        {
            double d = Math.Sqrt((x - cx * W) * (x - cx * W) + (y - cy * H) * (y - cy * H));
            Blend(x, y, c, Clamp(R - d + 0.5) * alpha);
        }
    }

    // 山稜：base/amp 以畫面高度比例；ridged=true 尖銳山峰；mist = 往下淡成霧
    public void Ridge(double baseY, double amp, double freq, int seed, string hex, string mistHex, double mistLen, double mistAmt, bool ridged, double alpha)
    {
        double[] c = C(hex), m = C(mistHex);
        for (int x = 0; x < W; x++)
        {
            double n = Fbm(x * freq / W * 4, 0.5, seed, 6, 0.5);
            if (ridged) n = 1 - Math.Abs(n * 2 - 1);
            double h = (baseY - amp * (n - 0.5) * 2) * H;
            // 霧從「平滑過的山腳線」往下算，不跟著每一欄的鋸齒走，否則會出現直條紋
            double ns = Fbm(x * freq / W * 4, 0.5, seed, 2, 0.5);
            if (ridged) ns = 1 - Math.Abs(ns * 2 - 1);
            double hs = (baseY - amp * (ns - 0.5) * 2) * H;
            double mistStart = hs + amp * 0.15 * H;
            for (int y = (int)Math.Max(0, Math.Floor(h)); y < H; y++)
            {
                double edge = Clamp(y - h + 0.5);
                double t = Clamp((y - mistStart) / (mistLen * H));
                double[] col = new double[3];
                for (int j = 0; j < 3; j++) col[j] = c[j] + (m[j] - c[j]) * t * mistAmt;
                Blend(x, y, col, edge * alpha);
            }
        }
    }

    // 針葉林樹梢線
    public void TreeLine(double baseY, double rollAmp, double treeH, double treeW, int count, int seed, string hex, string mistHex, double mistLen, double mistAmt, double alpha)
    {
        double[] c = C(hex), m = C(mistHex);
        var r = new Random(seed);
        double[] tx = new double[count], th = new double[count], tw = new double[count];
        for (int i = 0; i < count; i++) { tx[i] = r.NextDouble() * W; th[i] = treeH * H * (0.55 + r.NextDouble() * 0.6); tw[i] = treeW * W * (0.7 + r.NextDouble() * 0.6); }
        for (int x = 0; x < W; x++)
        {
            double h = (baseY - rollAmp * (Fbm(x / (double)W * 3, 0.3, seed, 4, 0.5) - 0.5) * 2) * H;
            double rough = (Fbm(x / (double)W * 120, 1.7, seed + 9, 3, 0.5) - 0.5) * 0.006 * H;
            double top = h;
            for (int i = 0; i < count; i++)
            {
                double d = Math.Abs(x - tx[i]);
                if (d < tw[i])
                {
                    // 樹的輪廓加上枝葉的參差，不要是乾淨的三角形
                    double k = 1 - d / tw[i];
                    // 雲杉：一層一層的枝條（鋸齒）＋細碎的葉緣
                    double tier = ((k * 7 + i * 0.37) % 1.0);
                    double jag = tier * th[i] * 0.07 * (1 - k * 0.6)
                               + (Noise(x * 0.9, i * 3.1, seed + 5) - 0.5) * th[i] * 0.10
                               + (Noise(x * 3.3, i * 7.3, seed + 6) - 0.5) * th[i] * 0.04;
                    double p = h - th[i] * Math.Pow(k, 0.9) + jag;
                    if (p < top) top = p;
                }
            }
            top += rough;
            for (int y = (int)Math.Max(0, Math.Floor(top)); y < H; y++)
            {
                double edge = Clamp(y - top + 0.5);
                double t = Clamp((y - h) / (mistLen * H));
                double[] col = new double[3];
                for (int j = 0; j < 3; j++) col[j] = c[j] + (m[j] - c[j]) * t * mistAmt;
                Blend(x, y, col, edge * alpha);
            }
        }
    }

    // 霧／雲：fbm 遮罩，限制在 y0~y1 的帶狀範圍
    public void Mist(string hex, double density, double y0, double y1, double scale, int seed, double contrast)
    {
        double[] c = C(hex);
        for (int y = 0; y < H; y++)
        {
            double k = y / (double)H;
            double band = k < y0 || k > y1 ? 0 : Math.Sin((k - y0) / (y1 - y0) * Math.PI);
            if (band <= 0) continue;
            for (int x = 0; x < W; x++)
            {
                double n = Fbm(x / (double)W * scale, y / (double)W * scale * 2.2, seed, 6, 0.55);
                double a = Clamp((n - 0.5) * contrast + 0.5) * band * density;
                Blend(x, y, c, a);
            }
        }
    }

    public void Stars(int count, int seed, double maxB)
    {
        var r = new Random(seed);
        double[] white = { 1, 1, 1 };
        for (int i = 0; i < count; i++)
        {
            double x = r.NextDouble() * W, y = r.NextDouble() * H * 0.75;
            double b = Math.Pow(r.NextDouble(), 3) * maxB + 0.05;
            double rad = 0.6 + b * 1.6;
            for (int dy = -3; dy <= 3; dy++) for (int dx = -3; dx <= 3; dx++)
            {
                double d2 = (dx * dx + dy * dy) / (rad * rad);
                Add((int)x + dx, (int)y + dy, white, Math.Exp(-d2 * 2) * b);
            }
        }
    }

    public void MilkyWay(string hex, double strength, int seed)
    {
        double[] c = C(hex);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            double u = x / (double)W, v = y / (double)H;
            double d = (v - (0.75 - u * 0.65)) / 0.16;
            double band = Math.Exp(-d * d);
            if (band < 0.01) continue;
            double n = Fbm(u * 6, v * 6, seed, 7, 0.6);
            Add(x, y, c, band * Clamp((n - 0.35) * 1.8) * strength);
        }
    }

    // 海面：越近浪紋越大
    public void Sea(double horizon, string far, string near, string glint, int seed)
    {
        double[] f = C(far), n = C(near), g = C(glint);
        for (int y = (int)(horizon * H); y < H; y++)
        {
            double d = (y - horizon * H) / (H * (1 - horizon));
            // 透視海面：z 是離觀看者的距離，浪紋在水平方向拉長
            double z = 1.0 / (d + 0.06);
            for (int x = 0; x < W; x++)
            {
                double u = (x / (double)W - 0.5) * z * 2.2;
                double w = Fbm(u * 1.0, z * 5.0, seed, 5, 0.5);
                double[] col = new double[3];
                for (int j = 0; j < 3; j++) col[j] = f[j] + (n[j] - f[j]) * Math.Pow(d, 0.7);
                int i = (y * W + x) * 3;
                px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
                double hl = Clamp((w - 0.55) * 4) * (0.35 + 0.4 * (1 - d));
                Blend(x, y, g, hl * 0.55);
                double sh = Clamp((0.42 - w) * 3) * 0.25;
                Blend(x, y, n, sh);
            }
        }
    }

    // 散景光斑（櫻花）
    public void Bokeh(int count, int seed, string[] hexes, double rMin, double rMax, double alpha, double yMin, double yMax)
    {
        var r = new Random(seed);
        for (int i = 0; i < count; i++)
        {
            double[] c = C(hexes[r.Next(hexes.Length)]);
            double cx = r.NextDouble() * W, cy = (yMin + r.NextDouble() * (yMax - yMin)) * H;
            double R = (rMin + r.NextDouble() * (rMax - rMin)) * W;
            double a0 = alpha * (0.4 + r.NextDouble() * 0.6);
            for (int y = (int)(cy - R - 4); y <= cy + R + 4; y++) for (int x = (int)(cx - R - 4); x <= cx + R + 4; x++)
            {
                double d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                double soft = Clamp((R - d) / (R * 0.35));
                double rim = Math.Exp(-Math.Pow((d - R * 0.92) / (R * 0.08), 2)) * 0.25;
                Blend(x, y, c, (soft * 0.85 + rim) * a0);
            }
        }
    }

    // 沙丘：亮面／暗面
    public void Dune(double baseY, double amp, double freq, int seed, string lit, string shade, double alpha)
    {
        double[] l = C(lit), s = C(shade);
        for (int x = 0; x < W; x++)
        {
            double fx = x / (double)W * freq;
            double h0 = Fbm(fx, 0.2, seed, 3, 0.45);
            double h = (baseY - amp * (h0 - 0.5) * 2) * H;
            // 用較寬的間距算坡度（平滑過），避免一塊一塊的明暗
            double ha = Fbm(fx - 0.01 * freq, 0.2, seed, 2, 0.45), hb = Fbm(fx + 0.01 * freq, 0.2, seed, 2, 0.45);
            double slope = (hb - ha) * 18;
            double k = Clamp(0.5 + slope);
            for (int y = (int)Math.Max(0, Math.Floor(h)); y < H; y++)
            {
                double depth = Clamp((y - h) / (0.25 * H));
                double[] col = new double[3];
                for (int j = 0; j < 3; j++) col[j] = l[j] + (s[j] - l[j]) * Clamp(k * 0.8 + depth * 0.3);
                Blend(x, y, col, Clamp(y - h + 0.5) * alpha);
            }
        }
    }

    // ---------- 樹 ----------
    // 粗細漸變的線段（樹幹、樹枝）
    public void Stroke(double x0, double y0, double x1, double y1, double w0, double w1, double[] c, double alpha)
    {
        double len = Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
        int steps = Math.Max(2, (int)(len / 1.2));
        for (int s = 0; s <= steps; s++)
        {
            double t = s / (double)steps;
            double cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, r = (w0 + (w1 - w0) * t) / 2;
            for (int y = (int)(cy - r - 1); y <= cy + r + 1; y++) for (int x = (int)(cx - r - 1); x <= cx + r + 1; x++)
            {
                double d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                double a = Clamp(r - d + 0.5) * alpha;
                if (a > 0) Blend(x, y, c, a);
            }
        }
    }

    // 櫻花樹：遞迴分枝，枝端長出一團團花
    public void CherryTree(double baseX, double baseY, double height, int seed, string trunkHex, string[] petalHexes, double alpha, double bloom)
    {
        var r = new Random(seed);
        double[] trunk = C(trunkHex);
        var tips = new System.Collections.Generic.List<double[]>();
        Branch(r, baseX * W, baseY * H, -Math.PI / 2 + (r.NextDouble() - 0.5) * 0.2, height * H * 0.34, height * H * 0.055, 0, 7, trunk, alpha, tips);
        double[][] petals = new double[petalHexes.Length][];
        for (int i = 0; i < petalHexes.Length; i++) petals[i] = C(petalHexes[i]);
        double cluster = height * H * 0.11;
        foreach (var tp in tips)
        {
            int n = (int)(70 * bloom * tp[2] * (0.6 + r.NextDouble() * 0.8));
            for (int k = 0; k < n; k++)
            {
                double ang = r.NextDouble() * Math.PI * 2, dist = Math.Abs(Gauss(r)) * cluster * tp[2];
                double cx = tp[0] + Math.Cos(ang) * dist, cy = tp[1] + Math.Sin(ang) * dist * 0.8 - cluster * 0.2;
                double rad = (2.5 + r.NextDouble() * 5.5) * height * 1.8;
                double[] c = petals[r.Next(petals.Length)];
                double a0 = alpha * (0.35 + r.NextDouble() * 0.5);
                for (int y = (int)(cy - rad - 1); y <= cy + rad + 1; y++) for (int x = (int)(cx - rad - 1); x <= cx + rad + 1; x++)
                {
                    double d = Math.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                    double a = Clamp((rad - d) / (rad * 0.5)) * a0;
                    if (a > 0) Blend(x, y, c, a);
                }
            }
        }
    }

    static double Gauss(Random r) { return Math.Sqrt(-2 * Math.Log(1 - r.NextDouble())) * Math.Cos(2 * Math.PI * r.NextDouble()); }

    void Branch(Random r, double x, double y, double ang, double len, double w, int depth, int maxDepth, double[] c, double alpha, System.Collections.Generic.List<double[]> tips)
    {
        // 枝條稍微彎曲：分兩段畫
        double bend = (r.NextDouble() - 0.5) * 0.35;
        double mx = x + Math.Cos(ang) * len * 0.5, my = y + Math.Sin(ang) * len * 0.5;
        double ex = mx + Math.Cos(ang + bend) * len * 0.5, ey = my + Math.Sin(ang + bend) * len * 0.5;
        double wEnd = w * 0.68;
        Stroke(x, y, mx, my, w, (w + wEnd) / 2, c, alpha);
        Stroke(mx, my, ex, ey, (w + wEnd) / 2, wEnd, c, alpha);
        if (depth >= 2) tips.Add(new double[] { mx, my, 0.7 });
        if (depth >= maxDepth) { tips.Add(new double[] { ex, ey, 1.0 }); return; }
        int kids = depth < 2 ? 2 : (r.NextDouble() < 0.4 ? 3 : 2);
        for (int i = 0; i < kids; i++)
        {
            // 櫻花樹往兩側開展：越上層角度越往外
            double spread = (0.35 + r.NextDouble() * 0.45) * (i % 2 == 0 ? 1 : -1);
            double na = ang + spread;
            na = na * 0.85 + (-Math.PI / 2) * 0.15 + (na > -Math.PI / 2 ? 0.08 : -0.08);
            Branch(r, ex, ey, na, len * (0.68 + r.NextDouble() * 0.14), wEnd, depth + 1, maxDepth, c, alpha, tips);
        }
    }

    // 銀河：明亮核心＋暗色星塵帶＋帶狀密集小星
    public void Galaxy(double strength, int seed)
    {
        double[] core = C("#F4E6CC"), edge = C("#8E9BDD"), dust = C("#0B0F22");
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            double u = x / (double)W, v = y / (double)H;
            double center = 0.92 - u * 0.95 + Math.Sin(u * 3.2) * 0.04;
            double d = (v - center) / 0.2;
            double band = Math.Exp(-d * d);
            if (band < 0.01) continue;
            double n = Fbm(u * 5, v * 5, seed, 7, 0.6);
            double glow = band * Clamp((n - 0.25) * 1.6) * strength;
            double coreK = Math.Exp(-d * d * 4);
            double[] c = new double[3];
            for (int j = 0; j < 3; j++) c[j] = edge[j] + (core[j] - edge[j]) * coreK;
            Add(x, y, c, glow);
            // 中央暗帶（星塵遮住光）
            double lane = Fbm(u * 9 + 3, v * 9, seed + 5, 6, 0.55);
            double laneMask = Math.Exp(-Math.Pow((v - center - 0.01) / 0.05, 2)) * Clamp((lane - 0.45) * 3);
            Blend(x, y, dust, laneMask * 0.55 * strength);
        }
        var r = new Random(seed + 9);
        double[] white = { 1, 1, 1 };
        for (int i = 0; i < 9000; i++)
        {
            double u = r.NextDouble();
            double center = 0.92 - u * 0.95 + Math.Sin(u * 3.2) * 0.04;
            double v = center + Gauss(r) * 0.07;
            int x = (int)(u * W), y = (int)(v * H);
            double b = Math.Pow(r.NextDouble(), 2.5) * 0.7 + 0.08;
            Add(x, y, white, b);
            if (b > 0.5) { Add(x + 1, y, white, b * 0.4); Add(x - 1, y, white, b * 0.4); Add(x, y + 1, white, b * 0.4); Add(x, y - 1, white, b * 0.4); }
        }
    }

    public void Grain(double amount)
    {
        for (int i = 0; i < px.Length; i += 3)
        {
            double g = (rng.NextDouble() - 0.5) * amount;
            px[i] = Clamp(px[i] + g); px[i + 1] = Clamp(px[i + 1] + g); px[i + 2] = Clamp(px[i + 2] + g);
        }
    }

    // 最後淡化：往底色拉
    public void Fade(string hex, double amount)
    {
        double[] c = C(hex);
        for (int i = 0; i < px.Length; i += 3) { px[i] += (c[0] - px[i]) * amount; px[i + 1] += (c[1] - px[i + 1]) * amount; px[i + 2] += (c[2] - px[i + 2]) * amount; }
    }

    public void Save(string path)
    {
        var bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb);
        var data = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
        byte[] buf = new byte[data.Stride * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++)
        {
            int i = (y * W + x) * 3, o = y * data.Stride + x * 3;
            buf[o] = (byte)(px[i + 2] * 255); buf[o + 1] = (byte)(px[i + 1] * 255); buf[o + 2] = (byte)(px[i] * 255);
        }
        Marshal.Copy(buf, 0, data.Scan0, buf.Length);
        bmp.UnlockBits(data);
        var enc = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
        var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
        bmp.Save(path, enc, p);
        bmp.Dispose();
    }
}
