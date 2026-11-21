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
        // 純色系列：沒有背景圖，用 Top→Bottom 漸層
        public string Top, Bottom;
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
        // 2026-11-22 純色系列
        new Spec { Id="cloud", Head="sans", Body="sans", Text="FF1F2328", Sub="FF5E646B", Primary="FF3B4A5A", Card="D9FFFFFF", Border="14000000", ChipBg="FFE6E3DC", Top="FFFAFAF8", Bottom="FFECEAE5", CardR=14, ChipR=12 },
        new Spec { Id="graphite", Head="sans", Body="sans", Text="FF1B2129", Sub="FF59626C", Primary="FF2E3A46", Card="D9FFFFFF", Border="14000000", ChipBg="FFDDE1E7", Top="FFEEF0F3", Bottom="FFD9DDE3", CardR=8, ChipR=8 },
        new Spec { Id="mist-blue", Head="sans", Body="sans", Text="FF1B2A33", Sub="FF4F6370", Primary="FF2F6F8F", Card="D9FFFFFF", Border="14000000", ChipBg="FFD9E8F1", Top="FFEEF4F8", Bottom="FFD6E4EE", CardR=14, ChipR=12 },
        new Spec { Id="sage", Head="sans", Body="sans", Text="FF1E2A20", Sub="FF566459", Primary="FF4E7A57", Card="D9FFFFFF", Border="14000000", ChipBg="FFDDE8D9", Top="FFF0F3EE", Bottom="FFDCE6D8", CardR=16, ChipR=12 },
        new Spec { Id="milk-tea", Head="serif", Body="sans", Text="FF2B1F17", Sub="FF6B5747", Primary="FF8A5A3C", Card="D9FFFFFF", Border="14000000", ChipBg="FFEFDFCB", Top="FFF8F2EA", Bottom="FFEADCCB", CardR=14, ChipR=12 },
        new Spec { Id="lavender", Head="sans", Body="sans", Text="FF221C33", Sub="FF5D5670", Primary="FF6A55A6", Card="D9FFFFFF", Border="14000000", ChipBg="FFE6E0F4", Top="FFF4F1F9", Bottom="FFE2DCF1", CardR=18, ChipR=12 },
        new Spec { Id="coral", Head="sans", Body="sans", Text="FF2E1A14", Sub="FF6E5248", Primary="FFC24E33", Card="D9FFFFFF", Border="14000000", ChipBg="FFFBE0D5", Top="FFFFF4EF", Bottom="FFF9DCCF", CardR=16, ChipR=999 },
        new Spec { Id="lemon", Head="sans", Body="sans", Text="FF2A2208", Sub="FF625A3A", Primary="FF7A5C00", Card="D9FFFFFF", Border="14000000", ChipBg="FFF6E9AE", Top="FFFFFCEB", Bottom="FFF7ECB8", CardR=16, ChipR=12 },
        new Spec { Id="midnight", Head="sans", Body="sans", Text="FFE8EEF6", Sub="FFA7B3C2", Primary="FF7FB2FF", Card="14FFFFFF", Border="24FFFFFF", ChipBg="FF263347", Top="FF1E2838", Bottom="FF111824", CardR=14, ChipR=12 },
        new Spec { Id="cocoa", Head="sans", Body="sans", Text="FFF3EAE2", Sub="FFBFAE9F", Primary="FFE2B07A", Card="14FFFFFF", Border="24FFFFFF", ChipBg="FF3A2E26", Top="FF2E241E", Bottom="FF17110E", CardR=14, ChipR=12 },
        // 2026-11-22 真實系列（背景圖跟 App 同一張）
        new Spec { Id="p-clouds", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF2D5B8A", Card="D1FFFFFF", Border="12000000", ChipBg="FFDCE7F2", CardR=16, ChipR=12 },
        new Spec { Id="p-coast", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF2B5F7A", Card="D1FFFFFF", Border="12000000", ChipBg="FFDCE8EE", CardR=16, ChipR=12 },
        new Spec { Id="p-boardwalk", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF3D6B52", Card="D1FFFFFF", Border="12000000", ChipBg="FFDCE8DF", CardR=16, ChipR=12 },
        new Spec { Id="p-city", Head="sans", Body="sans", Text="FFF4F6F8", Sub="FFC3C9D1", Primary="FFF2B84B", Card="B814181E", Border="2EFFFFFF", ChipBg="FF2A3242", CardR=16, ChipR=12 },
        new Spec { Id="p-galaxy", Head="sans", Body="sans", Text="FFF4F6F8", Sub="FFC3C9D1", Primary="FF9DB4FF", Card="B814181E", Border="2EFFFFFF", ChipBg="FF262D52", CardR=16, ChipR=12 },
        new Spec { Id="p-sakura", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FFB84D72", Card="D1FFFFFF", Border="12000000", ChipBg="FFF7E1E8", CardR=16, ChipR=12 },
        new Spec { Id="p-snowpeak", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF5A5A9E", Card="D1FFFFFF", Border="12000000", ChipBg="FFE4E2F2", CardR=16, ChipR=12 },
        new Spec { Id="p-dunes", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF7A6A52", Card="D1FFFFFF", Border="12000000", ChipBg="FFEAE5DC", CardR=16, ChipR=12 },
        new Spec { Id="p-moraine", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF16708A", Card="D1FFFFFF", Border="12000000", ChipBg="FFD5EAF0", CardR=16, ChipR=12 },
        new Spec { Id="p-fuji", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF2F4F8A", Card="D1FFFFFF", Border="12000000", ChipBg="FFDCE4F2", CardR=16, ChipR=12 },
        new Spec { Id="p-bookstore", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF7A5A3A", Card="D1FFFFFF", Border="12000000", ChipBg="FFEDE3D6", CardR=16, ChipR=12 },
        new Spec { Id="p-waterfall", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF3D7A3A", Card="D1FFFFFF", Border="12000000", ChipBg="FFDDEAD8", CardR=16, ChipR=12 },
        new Spec { Id="p-maple", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FFB9501C", Card="D1FFFFFF", Border="12000000", ChipBg="FFF7E0CF", CardR=16, ChipR=12 },
        new Spec { Id="p-lavender", Head="sans", Body="sans", Text="FF1C2228", Sub="FF4E565E", Primary="FF6A4FA3", Card="D1FFFFFF", Border="12000000", ChipBg="FFE7E0F3", CardR=16, ChipR=12 },
        new Spec { Id="p-aurora", Head="sans", Body="sans", Text="FFF4F6F8", Sub="FFC3C9D1", Primary="FF7EE0A8", Card="B814181E", Border="2EFFFFFF", ChipBg="FF1F3330", CardR=16, ChipR=12 },
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
            using (var bg = s.Top != null ? null : Image.FromFile(Path.Combine(bgDir, s.Id + ".jpg")))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

                if (bg == null)
                {
                    // 純色系列：上到下漸層
                    using (var grad = new LinearGradientBrush(new Rectangle(0, 0, W, H), C(s.Top), C(s.Bottom), LinearGradientMode.Vertical))
                        g.FillRectangle(grad, 0, 0, W, H);
                }
                else
                {
                    // 背景圖等比裁切填滿
                    float k = Math.Max((float)W / bg.Width, (float)H / bg.Height);
                    float bw = bg.Width * k, bh = bg.Height * k;
                    g.DrawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
                }

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
