// 產生 10 套外觀風格的 LINE 圖文選單圖片（2500x1686，2 排 x 4 格）。
// 色碼、字體、圓角照 apps/windows_app/lib/core/theme/app_themes.dart；背景用 App 同一張 assets/themes/{id}.jpg。
// 由 make-theme-images.ps1 編譯執行（字體會先下載到 fonts/，不進 git）。
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;

public static class ThemeMenus
{
    const int W = 2500, H = 1686, COLS = 4, ROWS = 2;

    // 標題、說明、Material Icons Round 字碼（跟 App 首頁卡片同一組圖示）
    static readonly string[][] Cells = {
        new[] { "財務", "收支・預算・資產", "" },      // account_balance_wallet
        new[] { "行事曆", "今天的行程", "" },          // calendar_today
        new[] { "代辦", "還沒做的事", "" },            // checklist
        new[] { "人生目標", "進度・打卡", "" },        // flag
        new[] { "知識庫", "收藏・展覽", "" },          // menu_book
        new[] { "購物車", "想買的東西・存錢", "" },    // shopping_cart
        new[] { "算命", "梅花易數", "" },              // auto_awesome
        new[] { "功能說明", "也可以直接打字問 AI", "" }, // smart_toy
    };

    class Spec
    {
        public string Id, Head, Body;
        public string Text, Sub, Primary, Card, Border, ChipBg, ChipLine;
        public float CardR, ChipR;
    }

    // 只取選單用得到的欄位；font: serif/sans/kai/round/geo
    static readonly Spec[] Specs = {
        new Spec { Id="dawn", Head="serif", Body="sans", Text="FF3D362C", Sub="FF6B5D4C", Primary="FFA65A22", Card="D6FFFFFF", Border="FFEADFCB", ChipBg="FFF2DFC8", CardR=18, ChipR=12 },
        new Spec { Id="ink-gold", Head="serif", Body="sans", Text="FFEDE3D3", Sub="FFA89A82", Primary="FFD4A657", Card="DB1D1A15", Border="FF3A342A", ChipBg="FF2E271C", CardR=14, ChipR=10 },
        new Spec { Id="paper", Head="serif", Body="sans", Text="FF1E1E1C", Sub="FF6B675F", Primary="FFB23A2B", Card="E0FFFFFF", Border="FFE2DDD3", ChipBg="FFFFFFFF", ChipLine="FF1E1E1C", CardR=6, ChipR=4 },
        new Spec { Id="forest", Head="kai", Body="sans", Text="FF22301F", Sub="FF536250", Primary="FF3F6B3A", Card="DBFFFFFF", Border="FFCFDAC4", ChipBg="FFDCE8D3", CardR=20, ChipR=999 },
        new Spec { Id="ocean", Head="sans", Body="sans", Text="FF12313F", Sub="FF4A6875", Primary="FF1F5F7A", Card="DBFFFFFF", Border="FFC4DCE4", ChipBg="FFD3E7EE", CardR=22, ChipR=14 },
        new Spec { Id="sakura", Head="kai", Body="sans", Text="FF4A2E33", Sub="FF8A6268", Primary="FFB8506A", Card="DEFFFFFF", Border="FFF1D3D8", ChipBg="FFFBE3E8", CardR=24, ChipR=999 },
        new Spec { Id="night", Head="serif", Body="sans", Text="FFE8EBFF", Sub="FFA3ABD6", Primary="FF9DB0FF", Card="D61E2547", Border="FF343E6E", ChipBg="FF2A3260", CardR=18, ChipR=12 },
        new Spec { Id="nordic", Head="geo", Body="sans", Text="FF1F2430", Sub="FF5D6472", Primary="FF3E63B8", Card="EDFFFFFF", Border="FFDADDE3", ChipBg="FFE3E8F2", CardR=8, ChipR=8 },
        new Spec { Id="retro", Head="serif", Body="sans", Text="FF3B2A1A", Sub="FF6F5A43", Primary="FFA8441F", Card="E6FFFAF0", Border="FFDCC7A0", ChipBg="FFF0D9A8", CardR=12, ChipR=10 },
        new Spec { Id="candy", Head="round", Body="round", Text="FF4A3B47", Sub="FF7D6A78", Primary="FFB4507A", Card="E0FFFFFF", Border="FFF3E1D8", ChipBg="FFFFE3D8", CardR=26, ChipR=999 },
    };

    static Color C(string argb) { return Color.FromArgb(Convert.ToInt32(argb, 16)); }

    static readonly List<PrivateFontCollection> keep = new List<PrivateFontCollection>();

    static FontFamily Family(string fontDir, string name)
    {
        var pfc = new PrivateFontCollection();
        pfc.AddFontFile(Path.Combine(fontDir, name + ".ttf"));
        keep.Add(pfc);
        return pfc.Families[0];
    }

    static Font MakeFont(FontFamily f, float px, bool bold)
    {
        if (bold && f.IsStyleAvailable(FontStyle.Bold)) return new Font(f, px, FontStyle.Bold, GraphicsUnit.Pixel);
        return new Font(f, px, FontStyle.Regular, GraphicsUnit.Pixel);
    }

    static GraphicsPath Rounded(RectangleF r, float rad)
    {
        rad = Math.Min(rad, Math.Min(r.Width, r.Height) / 2);
        var p = new GraphicsPath();
        if (rad <= 0.5f) { p.AddRectangle(r); return p; }
        float d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    public static void Run(string bgDir, string fontDir, string outDir)
    {
        Directory.CreateDirectory(outDir);
        var fams = new Dictionary<string, FontFamily>();
        foreach (var n in new[] { "serif", "sans", "kai", "round", "geo", "icons" }) fams[n] = Family(fontDir, n);

        // 手機上 2500px 寬的選單大約縮成 1/2.4，圓角跟著放大才會跟 App 看起來一樣
        const float scale = 2.4f;
        const float pad = 36, gap = 30;
        float cellW = (W - pad * 2 - gap * (COLS - 1)) / COLS;
        float cellH = (H - pad * 2 - gap * (ROWS - 1)) / ROWS;

        foreach (var s in Specs)
        {
            using (var bmp = new Bitmap(W, H))
            using (var g = Graphics.FromImage(bmp))
            using (var bg = Image.FromFile(Path.Combine(bgDir, s.Id + ".jpg")))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

                // 背景圖等比裁切填滿
                float k = Math.Max((float)W / bg.Width, (float)H / bg.Height);
                float bw = bg.Width * k, bh = bg.Height * k;
                g.DrawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);

                var titleFont = MakeFont(fams[s.Head], 108, true);
                var subFont = MakeFont(fams[s.Body], 50, false);
                var iconFont = new Font(fams["icons"], 132, FontStyle.Regular, GraphicsUnit.Pixel);
                var center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                var textBrush = new SolidBrush(C(s.Text));
                var subBrush = new SolidBrush(C(s.Sub));
                var primary = new SolidBrush(C(s.Primary));

                for (int i = 0; i < Cells.Length; i++)
                {
                    int col = i % COLS, row = i / COLS;
                    var r = new RectangleF(pad + col * (cellW + gap), pad + row * (cellH + gap), cellW, cellH);
                    using (var path = Rounded(r, s.CardR * scale))
                    {
                        g.FillPath(new SolidBrush(C(s.Card)), path);
                        g.DrawPath(new Pen(C(s.Border), 3), path);
                    }

                    const float chip = 220;
                    var cr = new RectangleF(r.X + (r.Width - chip) / 2, r.Y + r.Height * 0.13f, chip, chip);
                    using (var cp = Rounded(cr, s.ChipR >= 999 ? chip / 2 : s.ChipR * scale))
                    {
                        g.FillPath(new SolidBrush(C(s.ChipBg)), cp);
                        if (s.ChipLine != null) g.DrawPath(new Pen(C(s.ChipLine), 4), cp);
                    }
                    g.DrawString(Cells[i][2], iconFont, primary, new RectangleF(cr.X - 20, cr.Y - 10, cr.Width + 40, cr.Height + 20), center);

                    g.DrawString(Cells[i][0], titleFont, textBrush, new RectangleF(r.X, r.Y + r.Height * 0.52f, r.Width, r.Height * 0.2f), center);
                    g.DrawString(Cells[i][1], subFont, subBrush, new RectangleF(r.X, r.Y + r.Height * 0.72f, r.Width, r.Height * 0.14f), center);
                }

                // LINE 圖文選單圖片上限 1MB；JPG 才壓得下有背景圖的畫面
                var enc = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
                var ps = new EncoderParameters(1);
                ps.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
                bmp.Save(Path.Combine(outDir, s.Id + ".jpg"), enc, ps);
            }
        }
    }
}
