export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;
export interface gdi32Symbols {
    "GetObjectA": (...args: [Pointer, number, Pointer]) => number;
    "AddFontResourceA": (...args: [Pointer]) => number;
    "AddFontResourceW": (...args: [Pointer]) => number;
    "AnimatePalette": (...args: [Pointer, number, number, Pointer]) => number;
    "Arc": (...args: [Pointer, number, number, number, number, number, number, number, number]) => number;
    "BitBlt": (...args: [Pointer, number, number, number, number, Pointer, number, number, number]) => number;
    "CancelDC": (...args: [Pointer]) => number;
    "Chord": (...args: [Pointer, number, number, number, number, number, number, number, number]) => number;
    "CloseMetaFile": (...args: [Pointer]) => Pointer;
    "CombineRgn": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "CopyMetaFileA": (...args: [Pointer, Pointer]) => Pointer;
    "CopyMetaFileW": (...args: [Pointer, Pointer]) => Pointer;
    "CreateBitmap": (...args: [number, number, number, number, Pointer]) => Pointer;
    "CreateBitmapIndirect": (...args: [Pointer]) => Pointer;
    "CreateBrushIndirect": (...args: [Pointer]) => Pointer;
    "CreateCompatibleBitmap": (...args: [Pointer, number, number]) => Pointer;
    "CreateDiscardableBitmap": (...args: [Pointer, number, number]) => Pointer;
    "CreateCompatibleDC": (...args: [Pointer]) => Pointer;
    "CreateDCA": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateDCW": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateDIBitmap": (...args: [Pointer, Pointer, number, Pointer, Pointer, number]) => Pointer;
    "CreateDIBPatternBrush": (...args: [Pointer, number]) => Pointer;
    "CreateDIBPatternBrushPt": (...args: [Pointer, number]) => Pointer;
    "CreateEllipticRgn": (...args: [number, number, number, number]) => Pointer;
    "CreateEllipticRgnIndirect": (...args: [Pointer]) => Pointer;
    "CreateFontIndirectA": (...args: [Pointer]) => Pointer;
    "CreateFontIndirectW": (...args: [Pointer]) => Pointer;
    "CreateFontA": (...args: [number, number, number, number, number, number, number, number, number, number, number, number, number, Pointer]) => Pointer;
    "CreateFontW": (...args: [number, number, number, number, number, number, number, number, number, number, number, number, number, Pointer]) => Pointer;
    "CreateHatchBrush": (...args: [number, number]) => Pointer;
    "CreateICA": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateICW": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateMetaFileA": (...args: [Pointer]) => Pointer;
    "CreateMetaFileW": (...args: [Pointer]) => Pointer;
    "CreatePalette": (...args: [Pointer]) => Pointer;
    "CreatePen": (...args: [number, number, number]) => Pointer;
    "CreatePenIndirect": (...args: [Pointer]) => Pointer;
    "CreatePolyPolygonRgn": (...args: [Pointer, Pointer, number, number]) => Pointer;
    "CreatePatternBrush": (...args: [Pointer]) => Pointer;
    "CreateRectRgn": (...args: [number, number, number, number]) => Pointer;
    "CreateRectRgnIndirect": (...args: [Pointer]) => Pointer;
    "CreateRoundRectRgn": (...args: [number, number, number, number, number, number]) => Pointer;
    "CreateScalableFontResourceA": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "CreateScalableFontResourceW": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "CreateSolidBrush": (...args: [number]) => Pointer;
    "DeleteDC": (...args: [Pointer]) => number;
    "DeleteMetaFile": (...args: [Pointer]) => number;
    "DeleteObject": (...args: [Pointer]) => number;
    "DrawEscape": (...args: [Pointer, number, number, Pointer]) => number;
    "Ellipse": (...args: [Pointer, number, number, number, number]) => number;
    "EnumFontFamiliesExA": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "EnumFontFamiliesExW": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "EnumFontFamiliesA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumFontFamiliesW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumFontsA": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumFontsW": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumObjects": (...args: [Pointer, number, Pointer, number]) => number;
    "EqualRgn": (...args: [Pointer, Pointer]) => number;
    "ExcludeClipRect": (...args: [Pointer, number, number, number, number]) => number;
    "ExtCreateRegion": (...args: [Pointer, number, Pointer]) => Pointer;
    "ExtFloodFill": (...args: [Pointer, number, number, number, number]) => number;
    "FillRgn": (...args: [Pointer, Pointer, Pointer]) => number;
    "FloodFill": (...args: [Pointer, number, number, number]) => number;
    "FrameRgn": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "GetROP2": (...args: [Pointer]) => number;
    "GetAspectRatioFilterEx": (...args: [Pointer, Pointer]) => number;
    "GetBkColor": (...args: [Pointer]) => number;
    "GetDCBrushColor": (...args: [Pointer]) => number;
    "GetDCPenColor": (...args: [Pointer]) => number;
    "GetBkMode": (...args: [Pointer]) => number;
    "GetBitmapBits": (...args: [Pointer, number, Pointer]) => number;
    "GetBitmapDimensionEx": (...args: [Pointer, Pointer]) => number;
    "GetBoundsRect": (...args: [Pointer, Pointer, number]) => number;
    "GetBrushOrgEx": (...args: [Pointer, Pointer]) => number;
    "GetCharWidthA": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidthW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidth32A": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidth32W": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidthFloatA": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidthFloatW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidthsA": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidthsW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidthsFloatA": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidthsFloatW": (...args: [Pointer, number, number, Pointer]) => number;
    "GetClipBox": (...args: [Pointer, Pointer]) => number;
    "GetClipRgn": (...args: [Pointer, Pointer]) => number;
    "GetMetaRgn": (...args: [Pointer, Pointer]) => number;
    "GetCurrentObject": (...args: [Pointer, number]) => Pointer;
    "GetCurrentPositionEx": (...args: [Pointer, Pointer]) => number;
    "GetDeviceCaps": (...args: [Pointer, number]) => number;
    "GetDIBits": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, number]) => number;
    "GetFontData": (...args: [Pointer, number, number, Pointer, number]) => number;
    "GetGlyphOutlineA": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "GetGlyphOutlineW": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "GetGraphicsMode": (...args: [Pointer]) => number;
    "GetMapMode": (...args: [Pointer]) => number;
    "GetMetaFileBitsEx": (...args: [Pointer, number, Pointer]) => number;
    "GetMetaFileA": (...args: [Pointer]) => Pointer;
    "GetMetaFileW": (...args: [Pointer]) => Pointer;
    "GetNearestColor": (...args: [Pointer, number]) => number;
    "GetNearestPaletteIndex": (...args: [Pointer, number]) => number;
    "GetObjectType": (...args: [Pointer]) => number;
    "GetOutlineTextMetricsA": (...args: [Pointer, number, Pointer]) => number;
    "GetOutlineTextMetricsW": (...args: [Pointer, number, Pointer]) => number;
    "GetPaletteEntries": (...args: [Pointer, number, number, Pointer]) => number;
    "GetPixel": (...args: [Pointer, number, number]) => number;
    "GetPolyFillMode": (...args: [Pointer]) => number;
    "GetRasterizerCaps": (...args: [Pointer, number]) => number;
    "GetRandomRgn": (...args: [Pointer, Pointer, number]) => number;
    "GetRegionData": (...args: [Pointer, number, Pointer]) => number;
    "GetRgnBox": (...args: [Pointer, Pointer]) => number;
    "GetStockObject": (...args: [number]) => Pointer;
    "GetStretchBltMode": (...args: [Pointer]) => number;
    "GetSystemPaletteEntries": (...args: [Pointer, number, number, Pointer]) => number;
    "GetSystemPaletteUse": (...args: [Pointer]) => number;
    "GetTextCharacterExtra": (...args: [Pointer]) => number;
    "GetTextAlign": (...args: [Pointer]) => number;
    "GetTextColor": (...args: [Pointer]) => number;
    "GetTextExtentPointA": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentPointW": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentPoint32A": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentPoint32W": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentExPointA": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "GetTextExtentExPointW": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "GetFontLanguageInfo": (...args: [Pointer]) => number;
    "GetCharacterPlacementA": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "GetCharacterPlacementW": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "GetFontUnicodeRanges": (...args: [Pointer, Pointer]) => number;
    "GetGlyphIndicesA": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "GetGlyphIndicesW": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "GetTextExtentPointI": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentExPointI": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "GetCharWidthI": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "GetCharABCWidthsI": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "AddFontResourceExA": (...args: [Pointer, number, Pointer]) => number;
    "AddFontResourceExW": (...args: [Pointer, number, Pointer]) => number;
    "RemoveFontResourceExA": (...args: [Pointer, number, Pointer]) => number;
    "RemoveFontResourceExW": (...args: [Pointer, number, Pointer]) => number;
    "AddFontMemResourceEx": (...args: [Pointer, number, Pointer, Pointer]) => Pointer;
    "RemoveFontMemResourceEx": (...args: [Pointer]) => number;
    "CreateFontIndirectExA": (...args: [Pointer]) => Pointer;
    "CreateFontIndirectExW": (...args: [Pointer]) => Pointer;
    "GetViewportExtEx": (...args: [Pointer, Pointer]) => number;
    "GetViewportOrgEx": (...args: [Pointer, Pointer]) => number;
    "GetWindowExtEx": (...args: [Pointer, Pointer]) => number;
    "GetWindowOrgEx": (...args: [Pointer, Pointer]) => number;
    "IntersectClipRect": (...args: [Pointer, number, number, number, number]) => number;
    "InvertRgn": (...args: [Pointer, Pointer]) => number;
    "LineDDA": (...args: [number, number, number, number, Pointer, number]) => number;
    "LineTo": (...args: [Pointer, number, number]) => number;
    "MaskBlt": (...args: [Pointer, number, number, number, number, Pointer, number, number, Pointer, number, number, number]) => number;
    "PlgBlt": (...args: [Pointer, Pointer, Pointer, number, number, number, number, Pointer, number, number]) => number;
    "OffsetClipRgn": (...args: [Pointer, number, number]) => number;
    "OffsetRgn": (...args: [Pointer, number, number]) => number;
    "PatBlt": (...args: [Pointer, number, number, number, number, number]) => number;
    "Pie": (...args: [Pointer, number, number, number, number, number, number, number, number]) => number;
    "PlayMetaFile": (...args: [Pointer, Pointer]) => number;
    "PaintRgn": (...args: [Pointer, Pointer]) => number;
    "PolyPolygon": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "PtInRegion": (...args: [Pointer, number, number]) => number;
    "PtVisible": (...args: [Pointer, number, number]) => number;
    "RectInRegion": (...args: [Pointer, Pointer]) => number;
    "RectVisible": (...args: [Pointer, Pointer]) => number;
    "Rectangle": (...args: [Pointer, number, number, number, number]) => number;
    "RestoreDC": (...args: [Pointer, number]) => number;
    "ResetDCA": (...args: [Pointer, Pointer]) => Pointer;
    "ResetDCW": (...args: [Pointer, Pointer]) => Pointer;
    "RealizePalette": (...args: [Pointer]) => number;
    "RemoveFontResourceA": (...args: [Pointer]) => number;
    "RemoveFontResourceW": (...args: [Pointer]) => number;
    "RoundRect": (...args: [Pointer, number, number, number, number, number, number]) => number;
    "ResizePalette": (...args: [Pointer, number]) => number;
    "SaveDC": (...args: [Pointer]) => number;
    "SelectClipRgn": (...args: [Pointer, Pointer]) => number;
    "ExtSelectClipRgn": (...args: [Pointer, Pointer, number]) => number;
    "SetMetaRgn": (...args: [Pointer]) => number;
    "SelectObject": (...args: [Pointer, Pointer]) => Pointer;
    "SelectPalette": (...args: [Pointer, Pointer, number]) => Pointer;
    "SetBkColor": (...args: [Pointer, number]) => number;
    "SetDCBrushColor": (...args: [Pointer, number]) => number;
    "SetDCPenColor": (...args: [Pointer, number]) => number;
    "SetBkMode": (...args: [Pointer, number]) => number;
    "SetBitmapBits": (...args: [Pointer, number, Pointer]) => number;
    "SetBoundsRect": (...args: [Pointer, Pointer, number]) => number;
    "SetDIBits": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, number]) => number;
    "SetDIBitsToDevice": (...args: [Pointer, number, number, number, number, number, number, number, number, Pointer, Pointer, number]) => number;
    "SetMapperFlags": (...args: [Pointer, number]) => number;
    "SetGraphicsMode": (...args: [Pointer, number]) => number;
    "SetMapMode": (...args: [Pointer, number]) => number;
    "SetLayout": (...args: [Pointer, number]) => number;
    "GetLayout": (...args: [Pointer]) => number;
    "SetMetaFileBitsEx": (...args: [number, Pointer]) => Pointer;
    "SetPaletteEntries": (...args: [Pointer, number, number, Pointer]) => number;
    "SetPixel": (...args: [Pointer, number, number, number]) => number;
    "SetPixelV": (...args: [Pointer, number, number, number]) => number;
    "SetPolyFillMode": (...args: [Pointer, number]) => number;
    "StretchBlt": (...args: [Pointer, number, number, number, number, Pointer, number, number, number, number, number]) => number;
    "SetRectRgn": (...args: [Pointer, number, number, number, number]) => number;
    "StretchDIBits": (...args: [Pointer, number, number, number, number, number, number, number, number, Pointer, Pointer, number, number]) => number;
    "SetROP2": (...args: [Pointer, number]) => number;
    "SetStretchBltMode": (...args: [Pointer, number]) => number;
    "SetSystemPaletteUse": (...args: [Pointer, number]) => number;
    "SetTextCharacterExtra": (...args: [Pointer, number]) => number;
    "SetTextColor": (...args: [Pointer, number]) => number;
    "SetTextAlign": (...args: [Pointer, number]) => number;
    "SetTextJustification": (...args: [Pointer, number, number]) => number;
    "UpdateColors": (...args: [Pointer]) => number;
    "GdiAlphaBlend": (...args: [Pointer, number, number, number, number, Pointer, number, number, number, number, Pointer]) => number;
    "GdiTransparentBlt": (...args: [Pointer, number, number, number, number, Pointer, number, number, number, number, number]) => number;
    "GdiGradientFill": (...args: [Pointer, Pointer, number, Pointer, number, number]) => number;
    "PlayMetaFileRecord": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumMetaFile": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "CloseEnhMetaFile": (...args: [Pointer]) => Pointer;
    "CopyEnhMetaFileA": (...args: [Pointer, Pointer]) => Pointer;
    "CopyEnhMetaFileW": (...args: [Pointer, Pointer]) => Pointer;
    "CreateEnhMetaFileA": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateEnhMetaFileW": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "DeleteEnhMetaFile": (...args: [Pointer]) => number;
    "EnumEnhMetaFile": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GetEnhMetaFileA": (...args: [Pointer]) => Pointer;
    "GetEnhMetaFileW": (...args: [Pointer]) => Pointer;
    "GetEnhMetaFileBits": (...args: [Pointer, number, Pointer]) => number;
    "GetEnhMetaFileDescriptionA": (...args: [Pointer, number, Pointer]) => number;
    "GetEnhMetaFileDescriptionW": (...args: [Pointer, number, Pointer]) => number;
    "GetEnhMetaFileHeader": (...args: [Pointer, number, Pointer]) => number;
    "GetEnhMetaFilePaletteEntries": (...args: [Pointer, number, Pointer]) => number;
    "GetWinMetaFileBits": (...args: [Pointer, number, Pointer, number, Pointer]) => number;
    "PlayEnhMetaFile": (...args: [Pointer, Pointer, Pointer]) => number;
    "PlayEnhMetaFileRecord": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SetEnhMetaFileBits": (...args: [number, Pointer]) => Pointer;
    "GdiComment": (...args: [Pointer, number, Pointer]) => number;
    "GetTextMetricsA": (...args: [Pointer, Pointer]) => number;
    "GetTextMetricsW": (...args: [Pointer, Pointer]) => number;
    "AngleArc": (...args: [Pointer, number, number, number, number, number]) => number;
    "PolyPolyline": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetWorldTransform": (...args: [Pointer, Pointer]) => number;
    "SetWorldTransform": (...args: [Pointer, Pointer]) => number;
    "ModifyWorldTransform": (...args: [Pointer, Pointer, number]) => number;
    "CombineTransform": (...args: [Pointer, Pointer, Pointer]) => number;
    "CreateDIBSection": (...args: [Pointer, Pointer, number, Pointer, Pointer, number]) => Pointer;
    "GetDIBColorTable": (...args: [Pointer, number, number, Pointer]) => number;
    "SetDIBColorTable": (...args: [Pointer, number, number, Pointer]) => number;
    "SetColorAdjustment": (...args: [Pointer, Pointer]) => number;
    "GetColorAdjustment": (...args: [Pointer, Pointer]) => number;
    "CreateHalftonePalette": (...args: [Pointer]) => Pointer;
    "AbortPath": (...args: [Pointer]) => number;
    "ArcTo": (...args: [Pointer, number, number, number, number, number, number, number, number]) => number;
    "BeginPath": (...args: [Pointer]) => number;
    "CloseFigure": (...args: [Pointer]) => number;
    "EndPath": (...args: [Pointer]) => number;
    "FillPath": (...args: [Pointer]) => number;
    "FlattenPath": (...args: [Pointer]) => number;
    "GetPath": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "PathToRegion": (...args: [Pointer]) => Pointer;
    "PolyDraw": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "SelectClipPath": (...args: [Pointer, number]) => number;
    "SetArcDirection": (...args: [Pointer, number]) => number;
    "SetMiterLimit": (...args: [Pointer, number, Pointer]) => number;
    "StrokeAndFillPath": (...args: [Pointer]) => number;
    "StrokePath": (...args: [Pointer]) => number;
    "WidenPath": (...args: [Pointer]) => number;
    "ExtCreatePen": (...args: [number, number, Pointer, number, Pointer]) => Pointer;
    "GetMiterLimit": (...args: [Pointer, Pointer]) => number;
    "GetArcDirection": (...args: [Pointer]) => number;
    "GetObjectW": (...args: [Pointer, number, Pointer]) => number;
    "MoveToEx": (...args: [Pointer, number, number, Pointer]) => number;
    "TextOutA": (...args: [Pointer, number, number, Pointer, number]) => number;
    "TextOutW": (...args: [Pointer, number, number, Pointer, number]) => number;
    "ExtTextOutA": (...args: [Pointer, number, number, number, Pointer, Pointer, number, Pointer]) => number;
    "ExtTextOutW": (...args: [Pointer, number, number, number, Pointer, Pointer, number, Pointer]) => number;
    "PolyTextOutA": (...args: [Pointer, Pointer, number]) => number;
    "PolyTextOutW": (...args: [Pointer, Pointer, number]) => number;
    "CreatePolygonRgn": (...args: [Pointer, number, number]) => Pointer;
    "DPtoLP": (...args: [Pointer, Pointer, number]) => number;
    "LPtoDP": (...args: [Pointer, Pointer, number]) => number;
    "Polygon": (...args: [Pointer, Pointer, number]) => number;
    "Polyline": (...args: [Pointer, Pointer, number]) => number;
    "PolyBezier": (...args: [Pointer, Pointer, number]) => number;
    "PolyBezierTo": (...args: [Pointer, Pointer, number]) => number;
    "PolylineTo": (...args: [Pointer, Pointer, number]) => number;
    "SetViewportExtEx": (...args: [Pointer, number, number, Pointer]) => number;
    "SetViewportOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "SetWindowExtEx": (...args: [Pointer, number, number, Pointer]) => number;
    "SetWindowOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "OffsetViewportOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "OffsetWindowOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "ScaleViewportExtEx": (...args: [Pointer, number, number, number, number, Pointer]) => number;
    "ScaleWindowExtEx": (...args: [Pointer, number, number, number, number, Pointer]) => number;
    "SetBitmapDimensionEx": (...args: [Pointer, number, number, Pointer]) => number;
    "SetBrushOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "GetTextFaceA": (...args: [Pointer, number, Pointer]) => number;
    "GetTextFaceW": (...args: [Pointer, number, Pointer]) => number;
    "GetKerningPairsA": (...args: [Pointer, number, Pointer]) => number;
    "GetKerningPairsW": (...args: [Pointer, number, Pointer]) => number;
    "GetDCOrgEx": (...args: [Pointer, Pointer]) => number;
    "FixBrushOrgEx": (...args: [Pointer, number, number, Pointer]) => number;
    "UnrealizeObject": (...args: [Pointer]) => number;
    "GdiFlush": (...args: []) => number;
    "GdiSetBatchLimit": (...args: [number]) => number;
    "GdiGetBatchLimit": (...args: []) => number;
    "GetTextCharset": (...args: [Pointer]) => number;
    "GetTextCharsetInfo": (...args: [Pointer, Pointer, number]) => number;
    "TranslateCharsetInfo": (...args: [Pointer, Pointer, number]) => number;
    "BRUSHOBJ_pvAllocRbrush": (...args: [Pointer, number]) => Pointer;
    "BRUSHOBJ_pvGetRbrush": (...args: [Pointer]) => Pointer;
    "BRUSHOBJ_ulGetBrushColor": (...args: [Pointer]) => number;
    "BRUSHOBJ_hGetColorTransform": (...args: [Pointer]) => Pointer;
    "CLIPOBJ_cEnumStart": (...args: [Pointer, number, number, number, number]) => number;
    "CLIPOBJ_bEnum": (...args: [Pointer, number, Pointer]) => number;
    "CLIPOBJ_ppoGetPath": (...args: [Pointer]) => Pointer;
    "FONTOBJ_cGetAllGlyphHandles": (...args: [Pointer, Pointer]) => number;
    "FONTOBJ_vGetInfo": (...args: [Pointer, number, Pointer]) => void;
    "FONTOBJ_cGetGlyphs": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "FONTOBJ_pxoGetXform": (...args: [Pointer]) => Pointer;
    "FONTOBJ_pifi": (...args: [Pointer]) => Pointer;
    "FONTOBJ_pfdg": (...args: [Pointer]) => Pointer;
    "FONTOBJ_pvTrueTypeFontFile": (...args: [Pointer, Pointer]) => Pointer;
    "FONTOBJ_pQueryGlyphAttrs": (...args: [Pointer, number]) => Pointer;
    "PATHOBJ_vEnumStart": (...args: [Pointer]) => void;
    "PATHOBJ_bEnum": (...args: [Pointer, Pointer]) => number;
    "PATHOBJ_vEnumStartClipLines": (...args: [Pointer, Pointer, Pointer, Pointer]) => void;
    "PATHOBJ_bEnumClipLines": (...args: [Pointer, number, Pointer]) => number;
    "PATHOBJ_vGetBounds": (...args: [Pointer, Pointer]) => void;
    "STROBJ_vEnumStart": (...args: [Pointer]) => void;
    "STROBJ_bEnum": (...args: [Pointer, Pointer, Pointer]) => number;
    "STROBJ_bEnumPositionsOnly": (...args: [Pointer, Pointer, Pointer]) => number;
    "STROBJ_dwGetCodePage": (...args: [Pointer]) => number;
    "STROBJ_bGetAdvanceWidths": (...args: [Pointer, number, number, Pointer]) => number;
    "XFORMOBJ_iGetXform": (...args: [Pointer, Pointer]) => number;
    "XFORMOBJ_bApplyXform": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "XLATEOBJ_iXlate": (...args: [Pointer, number]) => number;
    "XLATEOBJ_piVector": (...args: [Pointer]) => Pointer;
    "XLATEOBJ_cGetPalette": (...args: [Pointer, number, number, Pointer]) => number;
    "XLATEOBJ_hGetColorTransform": (...args: [Pointer]) => Pointer;
    "EngCreateBitmap": (...args: [Pointer, number, number, number, Pointer]) => Pointer;
    "EngCreateDeviceSurface": (...args: [Pointer, Pointer, number]) => Pointer;
    "EngCreateDeviceBitmap": (...args: [Pointer, Pointer, number]) => Pointer;
    "EngDeleteSurface": (...args: [Pointer]) => number;
    "EngLockSurface": (...args: [Pointer]) => Pointer;
    "EngUnlockSurface": (...args: [Pointer]) => void;
    "EngEraseSurface": (...args: [Pointer, Pointer, number]) => number;
    "EngAssociateSurface": (...args: [Pointer, Pointer, number]) => number;
    "EngMarkBandingSurface": (...args: [Pointer]) => number;
    "EngCheckAbort": (...args: [Pointer]) => number;
    "EngDeletePath": (...args: [Pointer]) => void;
    "EngCreatePalette": (...args: [number, number, Pointer, number, number, number]) => Pointer;
    "EngDeletePalette": (...args: [Pointer]) => number;
    "EngCreateClip": (...args: []) => Pointer;
    "EngDeleteClip": (...args: [Pointer]) => void;
    "EngBitBlt": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EngLineTo": (...args: [Pointer, Pointer, Pointer, number, number, number, number, Pointer, number]) => number;
    "EngStretchBlt": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EngStretchBltROP": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, Pointer, number]) => number;
    "EngAlphaBlend": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "EngGradientFill": (...args: [Pointer, Pointer, Pointer, Pointer, number, Pointer, number, Pointer, Pointer, number]) => number;
    "EngTransparentBlt": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "EngTextOut": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EngStrokePath": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EngFillPath": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "EngStrokeAndFillPath": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number, number]) => number;
    "EngPaint": (...args: [Pointer, Pointer, Pointer, Pointer, number]) => number;
    "EngCopyBits": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "EngPlgBlt": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, number]) => number;
    "HT_Get8BPPFormatPalette": (...args: [Pointer, number, number, number]) => number;
    "HT_Get8BPPMaskPalette": (...args: [Pointer, number, number, number, number, number]) => number;
    "EngGetPrinterDataFileName": (...args: [Pointer]) => Pointer;
    "EngGetDriverName": (...args: [Pointer]) => Pointer;
    "EngLoadModule": (...args: [Pointer]) => Pointer;
    "EngFindResource": (...args: [Pointer, number, number, Pointer]) => Pointer;
    "EngFreeModule": (...args: [Pointer]) => void;
    "EngCreateSemaphore": (...args: []) => Pointer;
    "EngAcquireSemaphore": (...args: [Pointer]) => void;
    "EngReleaseSemaphore": (...args: [Pointer]) => void;
    "EngDeleteSemaphore": (...args: [Pointer]) => void;
    "EngMultiByteToUnicodeN": (...args: [Pointer, number, Pointer, Pointer, number]) => void;
    "EngUnicodeToMultiByteN": (...args: [Pointer, number, Pointer, Pointer, number]) => void;
    "EngQueryLocalTime": (...args: [Pointer]) => void;
    "EngComputeGlyphSet": (...args: [number, number, number]) => Pointer;
    "EngMultiByteToWideChar": (...args: [number, Pointer, number, Pointer, number]) => number;
    "EngWideCharToMultiByte": (...args: [number, Pointer, number, Pointer, number]) => number;
    "EngGetCurrentCodePage": (...args: [Pointer, Pointer]) => void;
    "EngQueryEMFInfo": (...args: [Pointer, Pointer]) => number;
    "ChoosePixelFormat": (...args: [Pointer, Pointer]) => number;
    "DescribePixelFormat": (...args: [Pointer, number, number, Pointer]) => number;
    "GetPixelFormat": (...args: [Pointer]) => number;
    "SetPixelFormat": (...args: [Pointer, number, Pointer]) => number;
    "GetEnhMetaFilePixelFormat": (...args: [Pointer, number, Pointer]) => number;
    "SwapBuffers": (...args: [Pointer]) => number;
    "GdiGetSpoolFileHandle": (...args: [Pointer, Pointer, Pointer]) => Pointer;
    "GdiDeleteSpoolFileHandle": (...args: [Pointer]) => number;
    "GdiGetPageCount": (...args: [Pointer]) => number;
    "GdiGetDC": (...args: [Pointer]) => Pointer;
    "GdiGetPageHandle": (...args: [Pointer, number, Pointer]) => Pointer;
    "GdiStartDocEMF": (...args: [Pointer, Pointer]) => number;
    "GdiStartPageEMF": (...args: [Pointer]) => number;
    "GdiPlayPageEMF": (...args: [Pointer, Pointer, Pointer, Pointer, Pointer]) => number;
    "GdiEndPageEMF": (...args: [Pointer, number]) => number;
    "GdiEndDocEMF": (...args: [Pointer]) => number;
    "GdiGetDevmodeForPage": (...args: [Pointer, number, Pointer, Pointer]) => number;
    "GdiResetDCEMF": (...args: [Pointer, Pointer]) => number;
    "Escape": (...args: [Pointer, number, number, Pointer, Pointer]) => number;
    "ExtEscape": (...args: [Pointer, number, number, Pointer, number, Pointer]) => number;
    "StartDocA": (...args: [Pointer, Pointer]) => number;
    "StartDocW": (...args: [Pointer, Pointer]) => number;
    "EndDoc": (...args: [Pointer]) => number;
    "StartPage": (...args: [Pointer]) => number;
    "EndPage": (...args: [Pointer]) => number;
    "AbortDoc": (...args: [Pointer]) => number;
    "SetAbortProc": (...args: [Pointer, Pointer]) => number;
    "SetWinMetaFileBits": (...args: [number, Pointer, Pointer, Pointer]) => Pointer;
    "SetICMMode": (...args: [Pointer, number]) => number;
    "CheckColorsInGamut": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetColorSpace": (...args: [Pointer]) => Pointer;
    "GetLogColorSpaceA": (...args: [Pointer, Pointer, number]) => number;
    "GetLogColorSpaceW": (...args: [Pointer, Pointer, number]) => number;
    "CreateColorSpaceA": (...args: [Pointer]) => Pointer;
    "CreateColorSpaceW": (...args: [Pointer]) => Pointer;
    "SetColorSpace": (...args: [Pointer, Pointer]) => Pointer;
    "DeleteColorSpace": (...args: [Pointer]) => number;
    "GetICMProfileA": (...args: [Pointer, Pointer, Pointer]) => number;
    "GetICMProfileW": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetICMProfileA": (...args: [Pointer, Pointer]) => number;
    "SetICMProfileW": (...args: [Pointer, Pointer]) => number;
    "GetDeviceGammaRamp": (...args: [Pointer, Pointer]) => number;
    "SetDeviceGammaRamp": (...args: [Pointer, Pointer]) => number;
    "ColorMatchToTarget": (...args: [Pointer, Pointer, number]) => number;
    "EnumICMProfilesA": (...args: [Pointer, Pointer, number]) => number;
    "EnumICMProfilesW": (...args: [Pointer, Pointer, number]) => number;
    "UpdateICMRegKeyA": (...args: [number, Pointer, Pointer, number]) => number;
    "UpdateICMRegKeyW": (...args: [number, Pointer, Pointer, number]) => number;
    "ColorCorrectPalette": (...args: [Pointer, Pointer, number, number]) => number;
    "GetObject": (...args: [Pointer, number, Pointer]) => number;
    "AddFontResource": (...args: [Pointer]) => number;
    "CopyMetaFile": (...args: [Pointer, Pointer]) => Pointer;
    "CreateDC": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateFontIndirect": (...args: [Pointer]) => Pointer;
    "CreateFont": (...args: [number, number, number, number, number, number, number, number, number, number, number, number, number, Pointer]) => Pointer;
    "CreateIC": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "CreateMetaFile": (...args: [Pointer]) => Pointer;
    "CreateScalableFontResource": (...args: [number, Pointer, Pointer, Pointer]) => number;
    "EnumFontFamiliesEx": (...args: [Pointer, Pointer, Pointer, number, number]) => number;
    "EnumFontFamilies": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "EnumFonts": (...args: [Pointer, Pointer, Pointer, number]) => number;
    "GetCharWidth": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidth32": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharWidthFloat": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidths": (...args: [Pointer, number, number, Pointer]) => number;
    "GetCharABCWidthsFloat": (...args: [Pointer, number, number, Pointer]) => number;
    "GetGlyphOutline": (...args: [Pointer, number, number, Pointer, number, Pointer, Pointer]) => number;
    "GetMetaFile": (...args: [Pointer]) => Pointer;
    "GetOutlineTextMetrics": (...args: [Pointer, number, Pointer]) => number;
    "GetTextExtentPoint": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentPoint32": (...args: [Pointer, Pointer, number, Pointer]) => number;
    "GetTextExtentExPoint": (...args: [Pointer, Pointer, number, number, Pointer, Pointer, Pointer]) => number;
    "GetCharacterPlacement": (...args: [Pointer, Pointer, number, number, Pointer, number]) => number;
    "GetGlyphIndices": (...args: [Pointer, Pointer, number, Pointer, number]) => number;
    "AddFontResourceEx": (...args: [Pointer, number, Pointer]) => number;
    "RemoveFontResourceEx": (...args: [Pointer, number, Pointer]) => number;
    "CreateFontIndirectEx": (...args: [Pointer]) => Pointer;
    "ResetDC": (...args: [Pointer, Pointer]) => Pointer;
    "RemoveFontResource": (...args: [Pointer]) => number;
    "CopyEnhMetaFile": (...args: [Pointer, Pointer]) => Pointer;
    "CreateEnhMetaFile": (...args: [Pointer, Pointer, Pointer, Pointer]) => Pointer;
    "GetEnhMetaFile": (...args: [Pointer]) => Pointer;
    "GetEnhMetaFileDescription": (...args: [Pointer, number, Pointer]) => number;
    "GetTextMetrics": (...args: [Pointer, Pointer]) => number;
    "TextOut": (...args: [Pointer, number, number, Pointer, number]) => number;
    "ExtTextOut": (...args: [Pointer, number, number, number, Pointer, Pointer, number, Pointer]) => number;
    "PolyTextOut": (...args: [Pointer, Pointer, number]) => number;
    "GetTextFace": (...args: [Pointer, number, Pointer]) => number;
    "GetKerningPairs": (...args: [Pointer, number, Pointer]) => number;
    "StartDoc": (...args: [Pointer, Pointer]) => number;
    "GetLogColorSpace": (...args: [Pointer, Pointer, number]) => number;
    "CreateColorSpace": (...args: [Pointer]) => Pointer;
    "GetICMProfile": (...args: [Pointer, Pointer, Pointer]) => number;
    "SetICMProfile": (...args: [Pointer, Pointer]) => number;
    "EnumICMProfiles": (...args: [Pointer, Pointer, number]) => number;
    "UpdateICMRegKey": (...args: [number, Pointer, Pointer, number]) => number;
}
export interface gdi32Library { readonly symbols: gdi32Symbols; close(): void; }
export declare const structs: {
  "BITMAP": {
    "size": 32,
    "fields": [
      {
        "name": "bmType",
        "offset": 0,
        "type": "i32"
      },
      {
        "name": "bmWidth",
        "offset": 4,
        "type": "i32"
      },
      {
        "name": "bmHeight",
        "offset": 8,
        "type": "i32"
      },
      {
        "name": "bmWidthBytes",
        "offset": 12,
        "type": "i32"
      },
      {
        "name": "bmPlanes",
        "offset": 16,
        "type": "u16"
      },
      {
        "name": "bmBitsPixel",
        "offset": 18,
        "type": "u16"
      },
      {
        "name": "bmBits",
        "offset": 24,
        "type": "void*"
      }
    ]
  },
  "BITMAPINFOHEADER": {
    "size": 40,
    "fields": [
      {
        "name": "biSize",
        "offset": 0,
        "type": "u32"
      },
      {
        "name": "biWidth",
        "offset": 4,
        "type": "i32"
      },
      {
        "name": "biHeight",
        "offset": 8,
        "type": "i32"
      },
      {
        "name": "biPlanes",
        "offset": 12,
        "type": "u16"
      },
      {
        "name": "biBitCount",
        "offset": 14,
        "type": "u16"
      },
      {
        "name": "biCompression",
        "offset": 16,
        "type": "u32"
      },
      {
        "name": "biSizeImage",
        "offset": 20,
        "type": "u32"
      },
      {
        "name": "biXPelsPerMeter",
        "offset": 24,
        "type": "i32"
      },
      {
        "name": "biYPelsPerMeter",
        "offset": 28,
        "type": "i32"
      },
      {
        "name": "biClrUsed",
        "offset": 32,
        "type": "u32"
      },
      {
        "name": "biClrImportant",
        "offset": 36,
        "type": "u32"
      }
    ]
  },
  "LOGFONTW": {
    "size": 40,
    "fields": [
      {
        "name": "lfHeight",
        "offset": 0,
        "type": "i32"
      },
      {
        "name": "lfWidth",
        "offset": 4,
        "type": "i32"
      },
      {
        "name": "lfEscapement",
        "offset": 8,
        "type": "i32"
      },
      {
        "name": "lfOrientation",
        "offset": 12,
        "type": "i32"
      },
      {
        "name": "lfWeight",
        "offset": 16,
        "type": "i32"
      },
      {
        "name": "lfItalic",
        "offset": 20,
        "type": "u8"
      },
      {
        "name": "lfUnderline",
        "offset": 21,
        "type": "u8"
      },
      {
        "name": "lfStrikeOut",
        "offset": 22,
        "type": "u8"
      },
      {
        "name": "lfCharSet",
        "offset": 23,
        "type": "Windows.Win32.Graphics.Gdi.FONT_CHARSET"
      },
      {
        "name": "lfOutPrecision",
        "offset": 24,
        "type": "Windows.Win32.Graphics.Gdi.FONT_OUTPUT_PRECISION"
      },
      {
        "name": "lfClipPrecision",
        "offset": 25,
        "type": "Windows.Win32.Graphics.Gdi.FONT_CLIP_PRECISION"
      },
      {
        "name": "lfQuality",
        "offset": 26,
        "type": "Windows.Win32.Graphics.Gdi.FONT_QUALITY"
      },
      {
        "name": "lfPitchAndFamily",
        "offset": 27,
        "type": "u8"
      },
      {
        "name": "lfFaceName",
        "offset": 32,
        "type": "u16[1]"
      }
    ]
  }
};
export declare const enums: {
  "RGN_COMBINE_MODE": {
    "RGN_AND": 1,
    "RGN_OR": 2,
    "RGN_XOR": 3,
    "RGN_DIFF": 4,
    "RGN_COPY": 5,
    "RGN_MIN": 1,
    "RGN_MAX": 5
  },
  "ETO_OPTIONS": {
    "ETO_OPAQUE": 2,
    "ETO_CLIPPED": 4,
    "ETO_GLYPH_INDEX": 16,
    "ETO_RTLREADING": 128,
    "ETO_NUMERICSLOCAL": 1024,
    "ETO_NUMERICSLATIN": 2048,
    "ETO_IGNORELANGUAGE": 4096,
    "ETO_PDY": 8192,
    "ETO_REVERSE_INDEX_MAP": 65536
  },
  "OBJ_TYPE": {
    "OBJ_PEN": 1,
    "OBJ_BRUSH": 2,
    "OBJ_DC": 3,
    "OBJ_METADC": 4,
    "OBJ_PAL": 5,
    "OBJ_FONT": 6,
    "OBJ_BITMAP": 7,
    "OBJ_REGION": 8,
    "OBJ_METAFILE": 9,
    "OBJ_MEMDC": 10,
    "OBJ_EXTPEN": 11,
    "OBJ_ENHMETADC": 12,
    "OBJ_ENHMETAFILE": 13,
    "OBJ_COLORSPACE": 14
  },
  "DIB_USAGE": {
    "DIB_RGB_COLORS": 0,
    "DIB_PAL_COLORS": 1
  },
  "TRANSLATE_CHARSET_INFO_FLAGS": {
    "TCI_SRCCHARSET": 1,
    "TCI_SRCCODEPAGE": 2,
    "TCI_SRCFONTSIG": 3,
    "TCI_SRCLOCALE": 4096
  },
  "TEXT_ALIGN_OPTIONS": {
    "TA_NOUPDATECP": 0,
    "TA_UPDATECP": 1,
    "TA_LEFT": 0,
    "TA_RIGHT": 2,
    "TA_CENTER": 6,
    "TA_TOP": 0,
    "TA_BOTTOM": 8,
    "TA_BASELINE": 24,
    "TA_RTLREADING": 256,
    "TA_MASK": 287,
    "VTA_BASELINE": 24,
    "VTA_LEFT": 8,
    "VTA_RIGHT": 0,
    "VTA_CENTER": 6,
    "VTA_BOTTOM": 2,
    "VTA_TOP": 0
  },
  "PEN_STYLE": {
    "PS_GEOMETRIC": 65536,
    "PS_COSMETIC": 0,
    "PS_SOLID": 0,
    "PS_DASH": 1,
    "PS_DOT": 2,
    "PS_DASHDOT": 3,
    "PS_DASHDOTDOT": 4,
    "PS_NULL": 5,
    "PS_INSIDEFRAME": 6,
    "PS_USERSTYLE": 7,
    "PS_ALTERNATE": 8,
    "PS_STYLE_MASK": 15,
    "PS_ENDCAP_ROUND": 0,
    "PS_ENDCAP_SQUARE": 256,
    "PS_ENDCAP_FLAT": 512,
    "PS_ENDCAP_MASK": 3840,
    "PS_JOIN_ROUND": 0,
    "PS_JOIN_BEVEL": 4096,
    "PS_JOIN_MITER": 8192,
    "PS_JOIN_MASK": 61440,
    "PS_TYPE_MASK": 983040
  },
  "GET_GLYPH_OUTLINE_FORMAT": {
    "GGO_BEZIER": 3,
    "GGO_BITMAP": 1,
    "GGO_GLYPH_INDEX": 128,
    "GGO_GRAY2_BITMAP": 4,
    "GGO_GRAY4_BITMAP": 5,
    "GGO_GRAY8_BITMAP": 6,
    "GGO_METRICS": 0,
    "GGO_NATIVE": 2,
    "GGO_UNHINTED": 256
  },
  "SET_BOUNDS_RECT_FLAGS": {
    "DCB_ACCUMULATE": 2,
    "DCB_DISABLE": 8,
    "DCB_ENABLE": 4,
    "DCB_RESET": 1
  },
  "GET_STOCK_OBJECT_FLAGS": {
    "BLACK_BRUSH": 4,
    "DKGRAY_BRUSH": 3,
    "DC_BRUSH": 18,
    "GRAY_BRUSH": 2,
    "HOLLOW_BRUSH": 5,
    "LTGRAY_BRUSH": 1,
    "NULL_BRUSH": 5,
    "WHITE_BRUSH": 0,
    "BLACK_PEN": 7,
    "DC_PEN": 19,
    "NULL_PEN": 8,
    "WHITE_PEN": 6,
    "ANSI_FIXED_FONT": 11,
    "ANSI_VAR_FONT": 12,
    "DEVICE_DEFAULT_FONT": 14,
    "DEFAULT_GUI_FONT": 17,
    "OEM_FIXED_FONT": 10,
    "SYSTEM_FONT": 13,
    "SYSTEM_FIXED_FONT": 16,
    "DEFAULT_PALETTE": 15
  },
  "MODIFY_WORLD_TRANSFORM_MODE": {
    "MWT_IDENTITY": 1,
    "MWT_LEFTMULTIPLY": 2,
    "MWT_RIGHTMULTIPLY": 3
  },
  "FONT_CLIP_PRECISION": {
    "CLIP_DEFAULT_PRECIS": 0,
    "CLIP_CHARACTER_PRECIS": 1,
    "CLIP_STROKE_PRECIS": 2,
    "CLIP_MASK": 15,
    "CLIP_LH_ANGLES": 16,
    "CLIP_TT_ALWAYS": 32,
    "CLIP_DFA_DISABLE": 64,
    "CLIP_EMBEDDED": 128,
    "CLIP_DFA_OVERRIDE": 64
  },
  "CREATE_POLYGON_RGN_MODE": {
    "ALTERNATE": 1,
    "WINDING": 2
  },
  "FONT_RESOURCE_CHARACTERISTICS": {
    "FR_PRIVATE": 16,
    "FR_NOT_ENUM": 32
  },
  "DC_LAYOUT": {
    "LAYOUT_BITMAPORIENTATIONPRESERVED": 8,
    "LAYOUT_RTL": 1
  },
  "FONT_OUTPUT_PRECISION": {
    "OUT_DEFAULT_PRECIS": 0,
    "OUT_STRING_PRECIS": 1,
    "OUT_CHARACTER_PRECIS": 2,
    "OUT_STROKE_PRECIS": 3,
    "OUT_TT_PRECIS": 4,
    "OUT_DEVICE_PRECIS": 5,
    "OUT_RASTER_PRECIS": 6,
    "OUT_TT_ONLY_PRECIS": 7,
    "OUT_OUTLINE_PRECIS": 8,
    "OUT_SCREEN_OUTLINE_PRECIS": 9,
    "OUT_PS_ONLY_PRECIS": 10
  },
  "FONT_CHARSET": {
    "ANSI_CHARSET": 0,
    "DEFAULT_CHARSET": 1,
    "SYMBOL_CHARSET": 2,
    "SHIFTJIS_CHARSET": 128,
    "HANGEUL_CHARSET": 129,
    "HANGUL_CHARSET": 129,
    "GB2312_CHARSET": 134,
    "CHINESEBIG5_CHARSET": 136,
    "OEM_CHARSET": 255,
    "JOHAB_CHARSET": 130,
    "HEBREW_CHARSET": 177,
    "ARABIC_CHARSET": 178,
    "GREEK_CHARSET": 161,
    "TURKISH_CHARSET": 162,
    "VIETNAMESE_CHARSET": 163,
    "THAI_CHARSET": 222,
    "EASTEUROPE_CHARSET": 238,
    "RUSSIAN_CHARSET": 204,
    "MAC_CHARSET": 77,
    "BALTIC_CHARSET": 186
  },
  "ARC_DIRECTION": {
    "AD_COUNTERCLOCKWISE": 1,
    "AD_CLOCKWISE": 2
  },
  "STRETCH_BLT_MODE": {
    "BLACKONWHITE": 1,
    "COLORONCOLOR": 3,
    "HALFTONE": 4,
    "STRETCH_ANDSCANS": 1,
    "STRETCH_DELETESCANS": 3,
    "STRETCH_HALFTONE": 4,
    "STRETCH_ORSCANS": 2,
    "WHITEONBLACK": 2
  },
  "FONT_QUALITY": {
    "DEFAULT_QUALITY": 0,
    "DRAFT_QUALITY": 1,
    "PROOF_QUALITY": 2,
    "NONANTIALIASED_QUALITY": 3,
    "ANTIALIASED_QUALITY": 4,
    "CLEARTYPE_QUALITY": 5
  },
  "GET_CHARACTER_PLACEMENT_FLAGS": {
    "GCP_CLASSIN": 524288,
    "GCP_DIACRITIC": 256,
    "GCP_DISPLAYZWG": 4194304,
    "GCP_GLYPHSHAPE": 16,
    "GCP_JUSTIFY": 65536,
    "GCP_KASHIDA": 1024,
    "GCP_LIGATE": 32,
    "GCP_MAXEXTENT": 1048576,
    "GCP_NEUTRALOVERRIDE": 33554432,
    "GCP_NUMERICOVERRIDE": 16777216,
    "GCP_NUMERICSLATIN": 67108864,
    "GCP_NUMERICSLOCAL": 134217728,
    "GCP_REORDER": 2,
    "GCP_SYMSWAPOFF": 8388608,
    "GCP_USEKERNING": 8
  },
  "GRADIENT_FILL": {
    "GRADIENT_FILL_RECT_H": 0,
    "GRADIENT_FILL_RECT_V": 1,
    "GRADIENT_FILL_TRIANGLE": 2
  },
  "EXT_FLOOD_FILL_TYPE": {
    "FLOODFILLBORDER": 0,
    "FLOODFILLSURFACE": 1
  },
  "HATCH_BRUSH_STYLE": {
    "HS_BDIAGONAL": 3,
    "HS_CROSS": 4,
    "HS_DIAGCROSS": 5,
    "HS_FDIAGONAL": 2,
    "HS_HORIZONTAL": 0,
    "HS_VERTICAL": 1
  },
  "SYSTEM_PALETTE_USE": {
    "SYSPAL_NOSTATIC": 2,
    "SYSPAL_NOSTATIC256": 3,
    "SYSPAL_STATIC": 1
  },
  "GRAPHICS_MODE": {
    "GM_COMPATIBLE": 1,
    "GM_ADVANCED": 2
  },
  "ROP_CODE": {
    "BLACKNESS": 66,
    "NOTSRCERASE": 1114278,
    "NOTSRCCOPY": 3342344,
    "SRCERASE": 4457256,
    "DSTINVERT": 5570569,
    "PATINVERT": 5898313,
    "SRCINVERT": 6684742,
    "SRCAND": 8913094,
    "MERGEPAINT": 12255782,
    "MERGECOPY": 12583114,
    "SRCCOPY": 13369376,
    "SRCPAINT": 15597702,
    "PATCOPY": 15728673,
    "PATPAINT": 16452105,
    "WHITENESS": 16711778,
    "CAPTUREBLT": 1073741824,
    "NOMIRRORBITMAP": 2147483648
  },
  "HDC_MAP_MODE": {
    "MM_ANISOTROPIC": 8,
    "MM_HIENGLISH": 5,
    "MM_HIMETRIC": 3,
    "MM_ISOTROPIC": 7,
    "MM_LOENGLISH": 4,
    "MM_LOMETRIC": 2,
    "MM_TEXT": 1,
    "MM_TWIPS": 6
  },
  "GDI_REGION_TYPE": {
    "RGN_ERROR": 0,
    "NULLREGION": 1,
    "SIMPLEREGION": 2,
    "COMPLEXREGION": 3
  },
  "ICM_COMMAND": {
    "ICM_ADDPROFILE": 1,
    "ICM_DELETEPROFILE": 2,
    "ICM_QUERYPROFILE": 3,
    "ICM_SETDEFAULTPROFILE": 4,
    "ICM_REGISTERICMATCHER": 5,
    "ICM_UNREGISTERICMATCHER": 6,
    "ICM_QUERYMATCH": 7
  },
  "ICM_MODE": {
    "ICM_OFF": 1,
    "ICM_ON": 2,
    "ICM_QUERY": 3,
    "ICM_DONE_OUTSIDEDC": 4
  },
  "COLOR_MATCH_TO_TARGET_ACTION": {
    "CS_ENABLE": 1,
    "CS_DISABLE": 2,
    "CS_DELETE_TRANSFORM": 3
  }
};
export declare const wideAliases: {
  "GetObject": "GetObjectW",
  "AddFontResource": "AddFontResourceW",
  "CopyMetaFile": "CopyMetaFileW",
  "CreateDC": "CreateDCW",
  "CreateFontIndirect": "CreateFontIndirectW",
  "CreateFont": "CreateFontW",
  "CreateIC": "CreateICW",
  "CreateMetaFile": "CreateMetaFileW",
  "CreateScalableFontResource": "CreateScalableFontResourceW",
  "EnumFontFamiliesEx": "EnumFontFamiliesExW",
  "EnumFontFamilies": "EnumFontFamiliesW",
  "EnumFonts": "EnumFontsW",
  "GetCharWidth": "GetCharWidthW",
  "GetCharWidth32": "GetCharWidth32W",
  "GetCharWidthFloat": "GetCharWidthFloatW",
  "GetCharABCWidths": "GetCharABCWidthsW",
  "GetCharABCWidthsFloat": "GetCharABCWidthsFloatW",
  "GetGlyphOutline": "GetGlyphOutlineW",
  "GetMetaFile": "GetMetaFileW",
  "GetOutlineTextMetrics": "GetOutlineTextMetricsW",
  "GetTextExtentPoint": "GetTextExtentPointW",
  "GetTextExtentPoint32": "GetTextExtentPoint32W",
  "GetTextExtentExPoint": "GetTextExtentExPointW",
  "GetCharacterPlacement": "GetCharacterPlacementW",
  "GetGlyphIndices": "GetGlyphIndicesW",
  "AddFontResourceEx": "AddFontResourceExW",
  "RemoveFontResourceEx": "RemoveFontResourceExW",
  "CreateFontIndirectEx": "CreateFontIndirectExW",
  "ResetDC": "ResetDCW",
  "RemoveFontResource": "RemoveFontResourceW",
  "CopyEnhMetaFile": "CopyEnhMetaFileW",
  "CreateEnhMetaFile": "CreateEnhMetaFileW",
  "GetEnhMetaFile": "GetEnhMetaFileW",
  "GetEnhMetaFileDescription": "GetEnhMetaFileDescriptionW",
  "GetTextMetrics": "GetTextMetricsW",
  "TextOut": "TextOutW",
  "ExtTextOut": "ExtTextOutW",
  "PolyTextOut": "PolyTextOutW",
  "GetTextFace": "GetTextFaceW",
  "GetKerningPairs": "GetKerningPairsW",
  "StartDoc": "StartDocW",
  "GetLogColorSpace": "GetLogColorSpaceW",
  "CreateColorSpace": "CreateColorSpaceW",
  "GetICMProfile": "GetICMProfileW",
  "SetICMProfile": "SetICMProfileW",
  "EnumICMProfiles": "EnumICMProfilesW",
  "UpdateICMRegKey": "UpdateICMRegKeyW"
};
export declare const signatures: {
  "gdi32.dll": {
    "GetObjectA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HGDIOBJ",
        "i32",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AddFontResourceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AddFontResourceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AnimatePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Arc": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BitBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.ROP_CODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CancelDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Chord": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "CombineRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.RGN_COMBINE_MODE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "CopyMetaFileA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMETAFILE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "CopyMetaFileW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMETAFILE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "CreateBitmap": {
      "args": [
        "i32",
        "i32",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "CreateBitmapIndirect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.BITMAP*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "CreateBrushIndirect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.LOGBRUSH*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "CreateCompatibleBitmap": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "CreateDiscardableBitmap": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "CreateCompatibleDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateDCA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateDCW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateDIBitmap": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.BITMAPINFOHEADER*",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "CreateDIBPatternBrush": {
      "args": [
        "Windows.Win32.Foundation.HGLOBAL",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "CreateDIBPatternBrushPt": {
      "args": [
        "void*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "CreateEllipticRgn": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreateEllipticRgnIndirect": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreateFontIndirectA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.LOGFONTA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "CreateFontIndirectW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.LOGFONTW*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "CreateFontA": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "CreateFontW": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "CreateHatchBrush": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HATCH_BRUSH_STYLE",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "CreateICA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateICW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateMetaFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateMetaFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreatePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.LOGPALETTE*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPALETTE",
      "setLastError": false
    },
    "CreatePen": {
      "args": [
        "Windows.Win32.Graphics.Gdi.PEN_STYLE",
        "i32",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPEN",
      "setLastError": false
    },
    "CreatePenIndirect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.LOGPEN*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPEN",
      "setLastError": false
    },
    "CreatePolyPolygonRgn": {
      "args": [
        "Windows.Win32.Foundation.POINT*",
        "i32*",
        "i32",
        "Windows.Win32.Graphics.Gdi.CREATE_POLYGON_RGN_MODE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreatePatternBrush": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HBITMAP"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "CreateRectRgn": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreateRectRgnIndirect": {
      "args": [
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreateRoundRectRgn": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "CreateScalableFontResourceA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateScalableFontResourceW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateSolidBrush": {
      "args": [
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBRUSH",
      "setLastError": false
    },
    "DeleteDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMETAFILE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DeleteObject": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HGDIOBJ"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "DrawEscape": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "Ellipse": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumFontFamiliesExA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.LOGFONTA*",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCA",
        "Windows.Win32.Foundation.LPARAM",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumFontFamiliesExW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.LOGFONTW*",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCW",
        "Windows.Win32.Foundation.LPARAM",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumFontFamiliesA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumFontFamiliesW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumFontsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumFontsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.FONTENUMPROCW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumObjects": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.OBJ_TYPE",
        "Windows.Win32.Graphics.Gdi.GOBJENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EqualRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExcludeClipRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "ExtCreateRegion": {
      "args": [
        "Windows.Win32.Graphics.Gdi.XFORM*",
        "u32",
        "Windows.Win32.Graphics.Gdi.RGNDATA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "ExtFloodFill": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.COLORREF",
        "Windows.Win32.Graphics.Gdi.EXT_FLOOD_FILL_TYPE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FillRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.HBRUSH"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FloodFill": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FrameRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.HBRUSH",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetROP2": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.R2_MODE",
      "setLastError": false
    },
    "GetAspectRatioFilterEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetBkColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetDCBrushColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetDCPenColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetBkMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetBitmapBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "i32",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetBitmapDimensionEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetBoundsRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetBrushOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidthA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidthW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidth32A": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidth32W": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidthFloatA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "f32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidthFloatW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "f32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharABCWidthsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.ABC*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharABCWidthsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.ABC*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharABCWidthsFloatA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.ABCFLOAT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharABCWidthsFloatW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.ABCFLOAT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetClipBox": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "GetClipRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetMetaRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetCurrentObject": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HGDIOBJ",
      "setLastError": false
    },
    "GetCurrentPositionEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDeviceCaps": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetDIBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetFontData": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "void*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGlyphOutlineA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.GET_GLYPH_OUTLINE_FORMAT",
        "Windows.Win32.Graphics.Gdi.GLYPHMETRICS*",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.MAT2*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGlyphOutlineW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.GET_GLYPH_OUTLINE_FORMAT",
        "Windows.Win32.Graphics.Gdi.GLYPHMETRICS*",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.MAT2*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGraphicsMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetMapMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC_MAP_MODE",
      "setLastError": false
    },
    "GetMetaFileBitsEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HMETAFILE",
        "u32",
        "void*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetMetaFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "GetMetaFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "GetNearestColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetNearestPaletteIndex": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetObjectType": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HGDIOBJ"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOutlineTextMetricsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.OUTLINETEXTMETRICA*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetOutlineTextMetricsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.OUTLINETEXTMETRICW*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPaletteEntries": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetPixel": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetPolyFillMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetRasterizerCaps": {
      "args": [
        "Windows.Win32.Graphics.Gdi.RASTERIZER_STATUS*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetRandomRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetRegionData": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "u32",
        "Windows.Win32.Graphics.Gdi.RGNDATA*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetRgnBox": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "GetStockObject": {
      "args": [
        "Windows.Win32.Graphics.Gdi.GET_STOCK_OBJECT_FLAGS"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HGDIOBJ",
      "setLastError": false
    },
    "GetStretchBltMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetSystemPaletteEntries": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetSystemPaletteUse": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTextCharacterExtra": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTextAlign": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.TEXT_ALIGN_OPTIONS",
      "setLastError": false
    },
    "GetTextColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "GetTextExtentPointA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentPointW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentPoint32A": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentPoint32W": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentExPointA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "i32*",
        "i32*",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentExPointW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "i32*",
        "i32*",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetFontLanguageInfo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCharacterPlacementA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.GCP_RESULTSA*",
        "Windows.Win32.Graphics.Gdi.GET_CHARACTER_PLACEMENT_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetCharacterPlacementW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.GCP_RESULTSW*",
        "Windows.Win32.Graphics.Gdi.GET_CHARACTER_PLACEMENT_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetFontUnicodeRanges": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.GLYPHSET*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGlyphIndicesA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "u16*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetGlyphIndicesW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "u16*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetTextExtentPointI": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u16*",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextExtentExPointI": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u16*",
        "i32",
        "i32",
        "i32*",
        "i32*",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharWidthI": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "u16*",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetCharABCWidthsI": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "u16*",
        "Windows.Win32.Graphics.Gdi.ABC*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddFontResourceExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Graphics.Gdi.FONT_RESOURCE_CHARACTERISTICS",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AddFontResourceExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.FONT_RESOURCE_CHARACTERISTICS",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "RemoveFontResourceExA": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveFontResourceExW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AddFontMemResourceEx": {
      "args": [
        "void*",
        "u32",
        "void*",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "RemoveFontMemResourceEx": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateFontIndirectExA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.ENUMLOGFONTEXDVA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "CreateFontIndirectExW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.ENUMLOGFONTEXDVW*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HFONT",
      "setLastError": false
    },
    "GetViewportExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetViewportOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWindowOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "IntersectClipRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "InvertRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LineDDA": {
      "args": [
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.LINEDDAPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LineTo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "MaskBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "i32",
        "i32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PlgBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OffsetClipRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "OffsetRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "PatBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.ROP_CODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Pie": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PlayMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HMETAFILE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PaintRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyPolygon": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "i32*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PtInRegion": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PtVisible": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RectInRegion": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RectVisible": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Rectangle": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RestoreDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ResetDCA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.DEVMODEA*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "ResetDCW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "RealizePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "RemoveFontResourceA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RemoveFontResourceW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "RoundRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ResizePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SaveDC": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SelectClipRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "ExtSelectClipRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HRGN",
        "Windows.Win32.Graphics.Gdi.RGN_COMBINE_MODE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "SetMetaRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.GDI_REGION_TYPE",
      "setLastError": false
    },
    "SelectObject": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HGDIOBJ"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HGDIOBJ",
      "setLastError": false
    },
    "SelectPalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "Windows.Win32.Foundation.BOOL"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPALETTE",
      "setLastError": false
    },
    "SetBkColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "SetDCBrushColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "SetDCPenColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "SetBkMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetBitmapBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "u32",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetBoundsRect": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Graphics.Gdi.SET_BOUNDS_RECT_FLAGS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetDIBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetDIBitsToDevice": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "u32",
        "u32",
        "i32",
        "i32",
        "u32",
        "u32",
        "void*",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetMapperFlags": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetGraphicsMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.GRAPHICS_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetMapMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HDC_MAP_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetLayout": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.DC_LAYOUT"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetLayout": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetMetaFileBitsEx": {
      "args": [
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HMETAFILE",
      "setLastError": false
    },
    "SetPaletteEntries": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetPixel": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "SetPixelV": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetPolyFillMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.CREATE_POLYGON_RGN_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "StretchBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.ROP_CODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetRectRgn": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HRGN",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StretchDIBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "void*",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE",
        "Windows.Win32.Graphics.Gdi.ROP_CODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetROP2": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.R2_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetStretchBltMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.STRETCH_BLT_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetSystemPaletteUse": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.SYSTEM_PALETTE_USE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetTextCharacterExtra": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetTextColor": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.COLORREF"
      ],
      "returns": "Windows.Win32.Foundation.COLORREF",
      "setLastError": false
    },
    "SetTextAlign": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.TEXT_ALIGN_OPTIONS"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetTextJustification": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateColors": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiAlphaBlend": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.BLENDFUNCTION"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiTransparentBlt": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiGradientFill": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.TRIVERTEX*",
        "u32",
        "void*",
        "u32",
        "Windows.Win32.Graphics.Gdi.GRADIENT_FILL"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PlayMetaFileRecord": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HANDLETABLE*",
        "Windows.Win32.Graphics.Gdi.METARECORD*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HMETAFILE",
        "Windows.Win32.Graphics.Gdi.MFENUMPROC",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseEnhMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "CopyEnhMetaFileA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "CopyEnhMetaFileW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "CreateEnhMetaFileA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "CreateEnhMetaFileW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "DeleteEnhMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumEnhMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "Windows.Win32.Graphics.Gdi.ENHMFENUMPROC",
        "void*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetEnhMetaFileA": {
      "args": [
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "GetEnhMetaFileW": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "GetEnhMetaFileBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "u8*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEnhMetaFileDescriptionA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEnhMetaFileDescriptionW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEnhMetaFileHeader": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "Windows.Win32.Graphics.Gdi.ENHMETAHEADER*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetEnhMetaFilePaletteEntries": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetWinMetaFileBits": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "u8*",
        "i32",
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "PlayEnhMetaFile": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PlayEnhMetaFileRecord": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HANDLETABLE*",
        "Windows.Win32.Graphics.Gdi.ENHMETARECORD*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetEnhMetaFileBits": {
      "args": [
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "GdiComment": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u8*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextMetricsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.TEXTMETRICA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextMetricsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.TEXTMETRICW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "AngleArc": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "u32",
        "f32",
        "f32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyPolyline": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u32*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetWorldTransform": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.XFORM*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWorldTransform": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.XFORM*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ModifyWorldTransform": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.XFORM*",
        "Windows.Win32.Graphics.Gdi.MODIFY_WORLD_TRANSFORM_MODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CombineTransform": {
      "args": [
        "Windows.Win32.Graphics.Gdi.XFORM*",
        "Windows.Win32.Graphics.Gdi.XFORM*",
        "Windows.Win32.Graphics.Gdi.XFORM*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateDIBSection": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.BITMAPINFO*",
        "Windows.Win32.Graphics.Gdi.DIB_USAGE",
        "void**",
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "GetDIBColorTable": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.RGBQUAD*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetDIBColorTable": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.RGBQUAD*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SetColorAdjustment": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.COLORADJUSTMENT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetColorAdjustment": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.COLORADJUSTMENT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateHalftonePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPALETTE",
      "setLastError": false
    },
    "AbortPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ArcTo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BeginPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CloseFigure": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EndPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FillPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FlattenPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u8*",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "PathToRegion": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "PolyDraw": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u8*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SelectClipPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.RGN_COMBINE_MODE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetArcDirection": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.ARC_DIRECTION"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetMiterLimit": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "f32",
        "f32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StrokeAndFillPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "StrokePath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "WidenPath": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExtCreatePen": {
      "args": [
        "u32",
        "u32",
        "Windows.Win32.Graphics.Gdi.LOGBRUSH*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPEN",
      "setLastError": false
    },
    "GetMiterLimit": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "f32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetArcDirection": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetObjectW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HGDIOBJ",
        "i32",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "MoveToEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TextOutA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "TextOutW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PWSTR",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExtTextOutA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.ETO_OPTIONS",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ExtTextOutW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Graphics.Gdi.ETO_OPTIONS",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "i32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyTextOutA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.POLYTEXTA*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyTextOutW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.POLYTEXTW*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreatePolygonRgn": {
      "args": [
        "Windows.Win32.Foundation.POINT*",
        "i32",
        "Windows.Win32.Graphics.Gdi.CREATE_POLYGON_RGN_MODE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HRGN",
      "setLastError": false
    },
    "DPtoLP": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "LPtoDP": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Polygon": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Polyline": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "i32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyBezier": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolyBezierTo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PolylineTo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetViewportExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetViewportOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetWindowOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OffsetViewportOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "OffsetWindowOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScaleViewportExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ScaleWindowExtEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetBitmapDimensionEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HBITMAP",
        "i32",
        "i32",
        "Windows.Win32.Foundation.SIZE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetBrushOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetTextFaceA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTextFaceW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetKerningPairsA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.KERNINGPAIR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetKerningPairsW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32",
        "Windows.Win32.Graphics.Gdi.KERNINGPAIR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GetDCOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "FixBrushOrgEx": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.POINT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UnrealizeObject": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HGDIOBJ"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiFlush": {
      "args": [],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiSetBatchLimit": {
      "args": [
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GdiGetBatchLimit": {
      "args": [],
      "returns": "u32",
      "setLastError": false
    },
    "GetTextCharset": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetTextCharsetInfo": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Globalization.FONTSIGNATURE*",
        "u32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "TranslateCharsetInfo": {
      "args": [
        "u32*",
        "Windows.Win32.Globalization.CHARSETINFO*",
        "Windows.Win32.Globalization.TRANSLATE_CHARSET_INFO_FLAGS"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "BRUSHOBJ_pvAllocRbrush": {
      "args": [
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "u32"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "BRUSHOBJ_pvGetRbrush": {
      "args": [
        "Windows.Win32.Devices.Display.BRUSHOBJ*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "BRUSHOBJ_ulGetBrushColor": {
      "args": [
        "Windows.Win32.Devices.Display.BRUSHOBJ*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "BRUSHOBJ_hGetColorTransform": {
      "args": [
        "Windows.Win32.Devices.Display.BRUSHOBJ*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "CLIPOBJ_cEnumStart": {
      "args": [
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Foundation.BOOL",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "CLIPOBJ_bEnum": {
      "args": [
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CLIPOBJ_ppoGetPath": {
      "args": [
        "Windows.Win32.Devices.Display.CLIPOBJ*"
      ],
      "returns": "Windows.Win32.Devices.Display.PATHOBJ*",
      "setLastError": false
    },
    "FONTOBJ_cGetAllGlyphHandles": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FONTOBJ_vGetInfo": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "u32",
        "Windows.Win32.Devices.Display.FONTINFO*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "FONTOBJ_cGetGlyphs": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "u32",
        "u32",
        "u32*",
        "void**"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "FONTOBJ_pxoGetXform": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*"
      ],
      "returns": "Windows.Win32.Devices.Display.XFORMOBJ*",
      "setLastError": false
    },
    "FONTOBJ_pifi": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*"
      ],
      "returns": "Windows.Win32.Devices.Display.IFIMETRICS*",
      "setLastError": false
    },
    "FONTOBJ_pfdg": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*"
      ],
      "returns": "Windows.Win32.Devices.Display.FD_GLYPHSET*",
      "setLastError": false
    },
    "FONTOBJ_pvTrueTypeFontFile": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "FONTOBJ_pQueryGlyphAttrs": {
      "args": [
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "u32"
      ],
      "returns": "Windows.Win32.Devices.Display.FD_GLYPHATTR*",
      "setLastError": false
    },
    "PATHOBJ_vEnumStart": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "PATHOBJ_bEnum": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.PATHDATA*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PATHOBJ_vEnumStartClipLines": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.LINEATTRS*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "PATHOBJ_bEnumClipLines": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "u32",
        "Windows.Win32.Devices.Display.CLIPLINE*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "PATHOBJ_vGetBounds": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.RECTFX*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "STROBJ_vEnumStart": {
      "args": [
        "Windows.Win32.Devices.Display.STROBJ*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "STROBJ_bEnum": {
      "args": [
        "Windows.Win32.Devices.Display.STROBJ*",
        "u32*",
        "Windows.Win32.Devices.Display.GLYPHPOS**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "STROBJ_bEnumPositionsOnly": {
      "args": [
        "Windows.Win32.Devices.Display.STROBJ*",
        "u32*",
        "Windows.Win32.Devices.Display.GLYPHPOS**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "STROBJ_dwGetCodePage": {
      "args": [
        "Windows.Win32.Devices.Display.STROBJ*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "STROBJ_bGetAdvanceWidths": {
      "args": [
        "Windows.Win32.Devices.Display.STROBJ*",
        "u32",
        "u32",
        "Windows.Win32.Devices.Display.POINTQF*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "XFORMOBJ_iGetXform": {
      "args": [
        "Windows.Win32.Devices.Display.XFORMOBJ*",
        "Windows.Win32.Devices.Display.XFORML*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "XFORMOBJ_bApplyXform": {
      "args": [
        "Windows.Win32.Devices.Display.XFORMOBJ*",
        "u32",
        "u32",
        "void*",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "XLATEOBJ_iXlate": {
      "args": [
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "u32"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "XLATEOBJ_piVector": {
      "args": [
        "Windows.Win32.Devices.Display.XLATEOBJ*"
      ],
      "returns": "u32*",
      "setLastError": false
    },
    "XLATEOBJ_cGetPalette": {
      "args": [
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "u32",
        "u32",
        "u32*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "XLATEOBJ_hGetColorTransform": {
      "args": [
        "Windows.Win32.Devices.Display.XLATEOBJ*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "EngCreateBitmap": {
      "args": [
        "Windows.Win32.Foundation.SIZE",
        "i32",
        "u32",
        "u32",
        "void*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "EngCreateDeviceSurface": {
      "args": [
        "Windows.Win32.Devices.Display.DHSURF",
        "Windows.Win32.Foundation.SIZE",
        "u32"
      ],
      "returns": "Windows.Win32.Devices.Display.HSURF",
      "setLastError": false
    },
    "EngCreateDeviceBitmap": {
      "args": [
        "Windows.Win32.Devices.Display.DHSURF",
        "Windows.Win32.Foundation.SIZE",
        "u32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HBITMAP",
      "setLastError": false
    },
    "EngDeleteSurface": {
      "args": [
        "Windows.Win32.Devices.Display.HSURF"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngLockSurface": {
      "args": [
        "Windows.Win32.Devices.Display.HSURF"
      ],
      "returns": "Windows.Win32.Devices.Display.SURFOBJ*",
      "setLastError": false
    },
    "EngUnlockSurface": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngEraseSurface": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngAssociateSurface": {
      "args": [
        "Windows.Win32.Devices.Display.HSURF",
        "Windows.Win32.Devices.Display.HDEV",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngMarkBandingSurface": {
      "args": [
        "Windows.Win32.Devices.Display.HSURF"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngCheckAbort": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngDeletePath": {
      "args": [
        "Windows.Win32.Devices.Display.PATHOBJ*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngCreatePalette": {
      "args": [
        "u32",
        "u32",
        "u32*",
        "u32",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HPALETTE",
      "setLastError": false
    },
    "EngDeletePalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HPALETTE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngCreateClip": {
      "args": [],
      "returns": "Windows.Win32.Devices.Display.CLIPOBJ*",
      "setLastError": false
    },
    "EngDeleteClip": {
      "args": [
        "Windows.Win32.Devices.Display.CLIPOBJ*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngBitBlt": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngLineTo": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "i32",
        "i32",
        "i32",
        "i32",
        "Windows.Win32.Foundation.RECTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngStretchBlt": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Graphics.Gdi.COLORADJUSTMENT*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngStretchBltROP": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Graphics.Gdi.COLORADJUSTMENT*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*",
        "u32",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngAlphaBlend": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Devices.Display.BLENDOBJ*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngGradientFill": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Graphics.Gdi.TRIVERTEX*",
        "u32",
        "void*",
        "u32",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngTransparentBlt": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.RECTL*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngTextOut": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.STROBJ*",
        "Windows.Win32.Devices.Display.FONTOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngStrokePath": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XFORMOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Devices.Display.LINEATTRS*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngFillPath": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngStrokeAndFillPath": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.PATHOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XFORMOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Devices.Display.LINEATTRS*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngPaint": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.BRUSHOBJ*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngCopyBits": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EngPlgBlt": {
      "args": [
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.SURFOBJ*",
        "Windows.Win32.Devices.Display.CLIPOBJ*",
        "Windows.Win32.Devices.Display.XLATEOBJ*",
        "Windows.Win32.Graphics.Gdi.COLORADJUSTMENT*",
        "Windows.Win32.Foundation.POINTL*",
        "Windows.Win32.Devices.Display.POINTFIX*",
        "Windows.Win32.Foundation.RECTL*",
        "Windows.Win32.Foundation.POINTL*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "HT_Get8BPPFormatPalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*",
        "u16",
        "u16",
        "u16"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "HT_Get8BPPMaskPalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.PALETTEENTRY*",
        "Windows.Win32.Foundation.BOOL",
        "u8",
        "u16",
        "u16",
        "u16"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EngGetPrinterDataFileName": {
      "args": [
        "Windows.Win32.Devices.Display.HDEV"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "EngGetDriverName": {
      "args": [
        "Windows.Win32.Devices.Display.HDEV"
      ],
      "returns": "Windows.Win32.Foundation.PWSTR",
      "setLastError": false
    },
    "EngLoadModule": {
      "args": [
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "EngFindResource": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "i32",
        "i32",
        "u32*"
      ],
      "returns": "void*",
      "setLastError": false
    },
    "EngFreeModule": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngCreateSemaphore": {
      "args": [],
      "returns": "Windows.Win32.Devices.Display.HSEMAPHORE",
      "setLastError": false
    },
    "EngAcquireSemaphore": {
      "args": [
        "Windows.Win32.Devices.Display.HSEMAPHORE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngReleaseSemaphore": {
      "args": [
        "Windows.Win32.Devices.Display.HSEMAPHORE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngDeleteSemaphore": {
      "args": [
        "Windows.Win32.Devices.Display.HSEMAPHORE"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngMultiByteToUnicodeN": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PSTR",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngUnicodeToMultiByteN": {
      "args": [
        "Windows.Win32.Foundation.PSTR",
        "u32",
        "u32*",
        "Windows.Win32.Foundation.PWSTR",
        "u32"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngQueryLocalTime": {
      "args": [
        "Windows.Win32.Devices.Display.ENG_TIME_FIELDS*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngComputeGlyphSet": {
      "args": [
        "i32",
        "i32",
        "i32"
      ],
      "returns": "Windows.Win32.Devices.Display.FD_GLYPHSET*",
      "setLastError": false
    },
    "EngMultiByteToWideChar": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EngWideCharToMultiByte": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EngGetCurrentCodePage": {
      "args": [
        "u16*",
        "u16*"
      ],
      "returns": "void",
      "setLastError": false
    },
    "EngQueryEMFInfo": {
      "args": [
        "Windows.Win32.Devices.Display.HDEV",
        "Windows.Win32.Devices.Display.EMFINFO*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ChoosePixelFormat": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.OpenGL.PIXELFORMATDESCRIPTOR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "DescribePixelFormat": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "u32",
        "Windows.Win32.Graphics.OpenGL.PIXELFORMATDESCRIPTOR*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "GetPixelFormat": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetPixelFormat": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "Windows.Win32.Graphics.OpenGL.PIXELFORMATDESCRIPTOR*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetEnhMetaFilePixelFormat": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
        "u32",
        "Windows.Win32.Graphics.OpenGL.PIXELFORMATDESCRIPTOR*"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "SwapBuffers": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiGetSpoolFileHandle": {
      "args": [
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GdiDeleteSpoolFileHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiGetPageCount": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "u32",
      "setLastError": false
    },
    "GdiGetDC": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HDC",
      "setLastError": false
    },
    "GdiGetPageHandle": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "u32*"
      ],
      "returns": "Windows.Win32.Foundation.HANDLE",
      "setLastError": false
    },
    "GdiStartDocEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Storage.Xps.DOCINFOW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiStartPageEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiPlayPageEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*",
        "Windows.Win32.Foundation.RECT*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiEndPageEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiEndDocEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiGetDevmodeForPage": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "u32",
        "Windows.Win32.Graphics.Gdi.DEVMODEW**",
        "Windows.Win32.Graphics.Gdi.DEVMODEW**"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GdiResetDCEMF": {
      "args": [
        "Windows.Win32.Foundation.HANDLE",
        "Windows.Win32.Graphics.Gdi.DEVMODEW*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "Escape": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "void*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "ExtEscape": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "i32",
        "i32",
        "Windows.Win32.Foundation.PSTR",
        "i32",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "StartDocA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Storage.Xps.DOCINFOA*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "StartDocW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Storage.Xps.DOCINFOW*"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EndDoc": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "StartPage": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EndPage": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "AbortDoc": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetAbortProc": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Storage.Xps.ABORTPROC"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "SetWinMetaFileBits": {
      "args": [
        "u32",
        "u8*",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.System.DataExchange.METAFILEPICT*"
      ],
      "returns": "Windows.Win32.Graphics.Gdi.HENHMETAFILE",
      "setLastError": false
    },
    "SetICMMode": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.UI.ColorSystem.ICM_MODE"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "CheckColorsInGamut": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.RGBTRIPLE*",
        "void*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetColorSpace": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC"
      ],
      "returns": "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
      "setLastError": false
    },
    "GetLogColorSpaceA": {
      "args": [
        "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
        "Windows.Win32.UI.ColorSystem.LOGCOLORSPACEA*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetLogColorSpaceW": {
      "args": [
        "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
        "Windows.Win32.UI.ColorSystem.LOGCOLORSPACEW*",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "CreateColorSpaceA": {
      "args": [
        "Windows.Win32.UI.ColorSystem.LOGCOLORSPACEA*"
      ],
      "returns": "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
      "setLastError": false
    },
    "CreateColorSpaceW": {
      "args": [
        "Windows.Win32.UI.ColorSystem.LOGCOLORSPACEW*"
      ],
      "returns": "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
      "setLastError": false
    },
    "SetColorSpace": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.UI.ColorSystem.HCOLORSPACE"
      ],
      "returns": "Windows.Win32.UI.ColorSystem.HCOLORSPACE",
      "setLastError": false
    },
    "DeleteColorSpace": {
      "args": [
        "Windows.Win32.UI.ColorSystem.HCOLORSPACE"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetICMProfileA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32*",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetICMProfileW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "u32*",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetICMProfileA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetICMProfileW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Foundation.PWSTR"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "GetDeviceGammaRamp": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "SetDeviceGammaRamp": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "void*"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ColorMatchToTarget": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.UI.ColorSystem.COLOR_MATCH_TO_TARGET_ACTION"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "EnumICMProfilesA": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.UI.ColorSystem.ICMENUMPROCA",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "EnumICMProfilesW": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.UI.ColorSystem.ICMENUMPROCW",
        "Windows.Win32.Foundation.LPARAM"
      ],
      "returns": "i32",
      "setLastError": false
    },
    "UpdateICMRegKeyA": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.Foundation.PSTR",
        "Windows.Win32.UI.ColorSystem.ICM_COMMAND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "UpdateICMRegKeyW": {
      "args": [
        "u32",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.Foundation.PWSTR",
        "Windows.Win32.UI.ColorSystem.ICM_COMMAND"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    },
    "ColorCorrectPalette": {
      "args": [
        "Windows.Win32.Graphics.Gdi.HDC",
        "Windows.Win32.Graphics.Gdi.HPALETTE",
        "u32",
        "u32"
      ],
      "returns": "Windows.Win32.Foundation.BOOL",
      "setLastError": false
    }
  }
};
export declare function open(): { "gdi32.dll": gdi32Library };
