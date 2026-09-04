const prisma = require('../config/database');
const ResponseFormatter = require('../utils/responseFormatter');
const asyncHandler = require('../utils/asyncHandler');
const { ValidationError } = require('../utils/errors');

function toInt(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function toDecimal(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}
function toDecimalOrNull(v) {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function toBool(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 1) return true;
  if (v === 0) return false;
  return Boolean(v);
}

exports.listStyleProfiles = asyncHandler(async (req, res) => {
  const isActiveParam = req.query.isActive;
  const where = {};

  if (isActiveParam !== undefined && isActiveParam !== '') {
    where.isActive = String(isActiveParam).toLowerCase() === 'true';
  }

  const styleProfiles = await prisma.smartDocumentStyleProfile.findMany({
    where,
    include: {
      _count: {
        select: { smartTemplates: true }
      }
    },
    orderBy: [
      { isDefault: 'desc' },
      { profileName: 'asc' }
    ]
  });

  return ResponseFormatter.success(
    res,
    { styleProfiles },
    'Style profiles retrieved successfully'
  );
});

exports.getStyleProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profileId = parseInt(id, 10);

  if (isNaN(profileId)) {
    return ResponseFormatter.error(res, 'Invalid profile ID', 400);
  }

  const styleProfile = await prisma.smartDocumentStyleProfile.findUnique({
    where: { id: profileId }
  });

  if (!styleProfile) {
    return ResponseFormatter.error(res, 'Style profile not found', 404);
  }

  return ResponseFormatter.success(
    res,
    { styleProfile },
    'Style profile retrieved successfully'
  );
});

exports.createStyleProfile = asyncHandler(async (req, res) => {
  const {
    profileName,
    description,
    isActive,
    isDefault,
    pageSize,
    pageOrientation,
    pageWidthMm,
    pageHeightMm,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    bodyFontFamily,
    bodyFontSizePt,
    heading1FontSizePt,
    heading2FontSizePt,
    heading3FontSizePt,
    headingFontFamily,
    headingFontBold,
    tableFontFamily,
    tableFontSizePt,
    lineSpacing,
    paragraphSpacingBeforePt,
    paragraphSpacingAfterPt,
    headerEnabled,
    headerHeightMm,
    headerLogoPath,
    headerUseCustomImage,
    headerCustomImagePath,
    headerCustomImageWidthMm,
    headerLeftText,
    headerCenterText,
    headerRightText,
    headerBorderBottomStyle,
    footerEnabled,
    footerHeightMm,
    footerUseCustomImage,
    footerCustomImagePath,
    footerCustomImageWidthMm,
    footerLeftText,
    footerCenterText,
    footerRightText,
    showPageNumbers,
    pageNumberFormat,
    showDocumentInfo,
    footerBorderTopStyle,
    tableBorderStyle,
    tableBorderWidthPt,
    tableHeaderFillColor,
    tableHeaderFontBold,
    tableCellPaddingPt,
    tableAlignment,
    pageBreakBeforeHeadings,
    widowOrphanControl,
    firstPageNumber,
    restartOnEachSection,
    useHybridPageNumbering,
    frontMatterThreshold,
    frontMatterFormat,
    heading4FontSizePt,
    typographyJson,
    headerUseProfessionalLayout,
    logoWidthMm,
    logoHeightMm,
    headerCompanyName,
    headerCompanyRegNo,
    headerCompanyNameUnderline,
    headerCompanyNameColor,
    headerCompanyAddressJson,
    headerCompanyPhone,
    headerCompanyEmail,
    headerCompanyEmailColor,
    headerBottomDividerEnabled,
    headerBottomDividerWidthPt,
    headerBottomDividerColor,
    footerUseProfessionalLayout,
    footerConfidentialText,
    footerClassificationMark,
    footerShowDocCodeAndRev,
    footerShowEffectiveDate,
    footerShowPreparedBy,
    footerShowApprovedBy,
    footerDisclaimerText,
    footerTopDividerEnabled,
    footerTopDividerWidthPt,
    footerTopDividerColor
  } = req.body;

  if (!profileName || typeof profileName !== 'string' || !profileName.trim()) {
    throw new ValidationError('Profile name is required');
  }

  const trimmedName = profileName.trim();
  const existing = await prisma.smartDocumentStyleProfile.findUnique({
    where: { profileName: trimmedName }
  });

  if (existing) {
    return ResponseFormatter.error(res, 'A style profile with this name already exists', 409);
  }

  const data = {
    profileName: trimmedName,
    createdById: req.user.id
  };

  if (description !== undefined) data.description = description;
  if (isActive !== undefined) data.isActive = toBool(isActive);
  if (isDefault !== undefined) data.isDefault = toBool(isDefault);
  if (pageSize !== undefined) data.pageSize = pageSize;
  if (pageOrientation !== undefined) data.pageOrientation = pageOrientation;
  if (pageWidthMm !== undefined) data.pageWidthMm = toDecimalOrNull(pageWidthMm);
  if (pageHeightMm !== undefined) data.pageHeightMm = toDecimalOrNull(pageHeightMm);
  if (marginTopMm !== undefined) data.marginTopMm = toDecimal(marginTopMm);
  if (marginBottomMm !== undefined) data.marginBottomMm = toDecimal(marginBottomMm);
  if (marginLeftMm !== undefined) data.marginLeftMm = toDecimal(marginLeftMm);
  if (marginRightMm !== undefined) data.marginRightMm = toDecimal(marginRightMm);
  if (bodyFontFamily !== undefined) data.bodyFontFamily = bodyFontFamily;
  if (bodyFontSizePt !== undefined) data.bodyFontSizePt = toInt(bodyFontSizePt);
  if (heading1FontSizePt !== undefined) data.heading1FontSizePt = toInt(heading1FontSizePt);
  if (heading2FontSizePt !== undefined) data.heading2FontSizePt = toInt(heading2FontSizePt);
  if (heading3FontSizePt !== undefined) data.heading3FontSizePt = toInt(heading3FontSizePt);
  if (heading4FontSizePt !== undefined) data.heading4FontSizePt = toInt(heading4FontSizePt);
  if (headingFontFamily !== undefined) data.headingFontFamily = headingFontFamily;
  if (headingFontBold !== undefined) data.headingFontBold = toBool(headingFontBold);
  if (tableFontFamily !== undefined) data.tableFontFamily = tableFontFamily;
  if (tableFontSizePt !== undefined) data.tableFontSizePt = toInt(tableFontSizePt);
  if (lineSpacing !== undefined) data.lineSpacing = toDecimal(lineSpacing);
  if (paragraphSpacingBeforePt !== undefined) data.paragraphSpacingBeforePt = toInt(paragraphSpacingBeforePt);
  if (paragraphSpacingAfterPt !== undefined) data.paragraphSpacingAfterPt = toInt(paragraphSpacingAfterPt);
  if (headerEnabled !== undefined) data.headerEnabled = toBool(headerEnabled);
  if (headerHeightMm !== undefined) data.headerHeightMm = toDecimalOrNull(headerHeightMm);
  if (headerLogoPath !== undefined) data.headerLogoPath = headerLogoPath;
  if (headerUseCustomImage !== undefined) data.headerUseCustomImage = toBool(headerUseCustomImage);
  if (headerCustomImagePath !== undefined) data.headerCustomImagePath = headerCustomImagePath;
  if (headerCustomImageWidthMm !== undefined) data.headerCustomImageWidthMm = toDecimalOrNull(headerCustomImageWidthMm);
  if (headerLeftText !== undefined) data.headerLeftText = headerLeftText;
  if (headerCenterText !== undefined) data.headerCenterText = headerCenterText;
  if (headerRightText !== undefined) data.headerRightText = headerRightText;
  if (headerBorderBottomStyle !== undefined) data.headerBorderBottomStyle = headerBorderBottomStyle;
  if (footerEnabled !== undefined) data.footerEnabled = toBool(footerEnabled);
  if (footerHeightMm !== undefined) data.footerHeightMm = toDecimalOrNull(footerHeightMm);
  if (footerUseCustomImage !== undefined) data.footerUseCustomImage = toBool(footerUseCustomImage);
  if (footerCustomImagePath !== undefined) data.footerCustomImagePath = footerCustomImagePath;
  if (footerCustomImageWidthMm !== undefined) data.footerCustomImageWidthMm = toDecimalOrNull(footerCustomImageWidthMm);
  if (footerLeftText !== undefined) data.footerLeftText = footerLeftText;
  if (footerCenterText !== undefined) data.footerCenterText = footerCenterText;
  if (footerRightText !== undefined) data.footerRightText = footerRightText;
  if (showPageNumbers !== undefined) data.showPageNumbers = toBool(showPageNumbers);
  if (pageNumberFormat !== undefined) data.pageNumberFormat = pageNumberFormat;
  if (showDocumentInfo !== undefined) data.showDocumentInfo = toBool(showDocumentInfo);
  if (footerBorderTopStyle !== undefined) data.footerBorderTopStyle = footerBorderTopStyle;
  if (tableBorderStyle !== undefined) data.tableBorderStyle = tableBorderStyle;
  if (tableBorderWidthPt !== undefined) data.tableBorderWidthPt = toDecimal(tableBorderWidthPt);
  if (tableHeaderFillColor !== undefined) data.tableHeaderFillColor = tableHeaderFillColor;
  if (tableHeaderFontBold !== undefined) data.tableHeaderFontBold = toBool(tableHeaderFontBold);
  if (tableCellPaddingPt !== undefined) data.tableCellPaddingPt = toInt(tableCellPaddingPt);
  if (tableAlignment !== undefined) data.tableAlignment = tableAlignment;
  if (pageBreakBeforeHeadings !== undefined) data.pageBreakBeforeHeadings = toBool(pageBreakBeforeHeadings);
  if (widowOrphanControl !== undefined) data.widowOrphanControl = toBool(widowOrphanControl);
  if (firstPageNumber !== undefined) data.firstPageNumber = toInt(firstPageNumber);
  if (restartOnEachSection !== undefined) data.restartOnEachSection = toBool(restartOnEachSection);
  if (useHybridPageNumbering !== undefined) data.useHybridPageNumbering = toBool(useHybridPageNumbering);
  if (frontMatterThreshold !== undefined) data.frontMatterThreshold = toInt(frontMatterThreshold);
  if (frontMatterFormat !== undefined) data.frontMatterFormat = String(frontMatterFormat);
  if (typographyJson !== undefined) data.typographyJson = typographyJson;
  if (headerUseProfessionalLayout !== undefined) data.headerUseProfessionalLayout = toBool(headerUseProfessionalLayout);
  if (logoWidthMm !== undefined) data.logoWidthMm = toDecimalOrNull(logoWidthMm);
  if (logoHeightMm !== undefined) data.logoHeightMm = toDecimalOrNull(logoHeightMm);
  if (headerCompanyName !== undefined) data.headerCompanyName = headerCompanyName;
  if (headerCompanyRegNo !== undefined) data.headerCompanyRegNo = headerCompanyRegNo;
  if (headerCompanyNameUnderline !== undefined) data.headerCompanyNameUnderline = toBool(headerCompanyNameUnderline);
  if (headerCompanyNameColor !== undefined) data.headerCompanyNameColor = headerCompanyNameColor;
  if (headerCompanyAddressJson !== undefined) data.headerCompanyAddressJson = headerCompanyAddressJson;
  if (headerCompanyPhone !== undefined) data.headerCompanyPhone = headerCompanyPhone;
  if (headerCompanyEmail !== undefined) data.headerCompanyEmail = headerCompanyEmail;
  if (headerCompanyEmailColor !== undefined) data.headerCompanyEmailColor = headerCompanyEmailColor;
  if (headerBottomDividerEnabled !== undefined) data.headerBottomDividerEnabled = toBool(headerBottomDividerEnabled);
  if (headerBottomDividerWidthPt !== undefined) data.headerBottomDividerWidthPt = toDecimal(headerBottomDividerWidthPt);
  if (headerBottomDividerColor !== undefined) data.headerBottomDividerColor = headerBottomDividerColor;
  if (footerUseProfessionalLayout !== undefined) data.footerUseProfessionalLayout = toBool(footerUseProfessionalLayout);
  if (footerConfidentialText !== undefined) data.footerConfidentialText = footerConfidentialText;
  if (footerClassificationMark !== undefined) data.footerClassificationMark = footerClassificationMark;
  if (footerShowDocCodeAndRev !== undefined) data.footerShowDocCodeAndRev = toBool(footerShowDocCodeAndRev);
  if (footerShowEffectiveDate !== undefined) data.footerShowEffectiveDate = toBool(footerShowEffectiveDate);
  if (footerShowPreparedBy !== undefined) data.footerShowPreparedBy = toBool(footerShowPreparedBy);
  if (footerShowApprovedBy !== undefined) data.footerShowApprovedBy = toBool(footerShowApprovedBy);
  if (footerDisclaimerText !== undefined) data.footerDisclaimerText = footerDisclaimerText;
  if (footerTopDividerEnabled !== undefined) data.footerTopDividerEnabled = toBool(footerTopDividerEnabled);
  if (footerTopDividerWidthPt !== undefined) data.footerTopDividerWidthPt = toDecimal(footerTopDividerWidthPt);
  if (footerTopDividerColor !== undefined) data.footerTopDividerColor = footerTopDividerColor;

  const styleProfile = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.smartDocumentStyleProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    return await tx.smartDocumentStyleProfile.create({ data });
  });

  return ResponseFormatter.success(
    res,
    { styleProfile },
    'Style profile created successfully',
    201
  );
});

exports.updateStyleProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profileId = parseInt(id, 10);

  if (isNaN(profileId)) {
    return ResponseFormatter.error(res, 'Invalid profile ID', 400);
  }

  const existing = await prisma.smartDocumentStyleProfile.findUnique({
    where: { id: profileId }
  });

  if (!existing) {
    return ResponseFormatter.error(res, 'Style profile not found', 404);
  }

  const {
    profileName,
    description,
    isActive,
    isDefault,
    pageSize,
    pageOrientation,
    pageWidthMm,
    pageHeightMm,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    bodyFontFamily,
    bodyFontSizePt,
    heading1FontSizePt,
    heading2FontSizePt,
    heading3FontSizePt,
    headingFontFamily,
    headingFontBold,
    tableFontFamily,
    tableFontSizePt,
    lineSpacing,
    paragraphSpacingBeforePt,
    paragraphSpacingAfterPt,
    headerEnabled,
    headerHeightMm,
    headerLogoPath,
    headerUseCustomImage,
    headerCustomImagePath,
    headerCustomImageWidthMm,
    headerLeftText,
    headerCenterText,
    headerRightText,
    headerBorderBottomStyle,
    footerEnabled,
    footerHeightMm,
    footerUseCustomImage,
    footerCustomImagePath,
    footerCustomImageWidthMm,
    footerLeftText,
    footerCenterText,
    footerRightText,
    showPageNumbers,
    pageNumberFormat,
    showDocumentInfo,
    footerBorderTopStyle,
    tableBorderStyle,
    tableBorderWidthPt,
    tableHeaderFillColor,
    tableHeaderFontBold,
    tableCellPaddingPt,
    tableAlignment,
    pageBreakBeforeHeadings,
    widowOrphanControl,
    firstPageNumber,
    restartOnEachSection,
    useHybridPageNumbering,
    frontMatterThreshold,
    frontMatterFormat,
    heading4FontSizePt,
    typographyJson,
    headerUseProfessionalLayout,
    logoWidthMm,
    logoHeightMm,
    headerCompanyName,
    headerCompanyRegNo,
    headerCompanyNameUnderline,
    headerCompanyNameColor,
    headerCompanyAddressJson,
    headerCompanyPhone,
    headerCompanyEmail,
    headerCompanyEmailColor,
    headerBottomDividerEnabled,
    headerBottomDividerWidthPt,
    headerBottomDividerColor,
    footerUseProfessionalLayout,
    footerConfidentialText,
    footerClassificationMark,
    footerShowDocCodeAndRev,
    footerShowEffectiveDate,
    footerShowPreparedBy,
    footerShowApprovedBy,
    footerDisclaimerText,
    footerTopDividerEnabled,
    footerTopDividerWidthPt,
    footerTopDividerColor
  } = req.body;

  const data = {};

  if (profileName !== undefined) {
    const trimmed = typeof profileName === 'string' ? profileName.trim() : '';
    if (!trimmed) {
      throw new ValidationError('Profile name cannot be empty');
    }
    const nameConflict = await prisma.smartDocumentStyleProfile.findFirst({
      where: { profileName: trimmed, id: { not: profileId } }
    });
    if (nameConflict) {
      return ResponseFormatter.error(res, 'A style profile with this name already exists', 409);
    }
    data.profileName = trimmed;
  }

  if (description !== undefined) data.description = description;
  if (isActive !== undefined) {
    if (toBool(isActive) === false && existing.isDefault === true) {
      return ResponseFormatter.error(res, 'Cannot deactivate the default style profile. Set another profile as default first.', 400);
    }
    data.isActive = toBool(isActive);
  }
  if (isDefault !== undefined) data.isDefault = toBool(isDefault);
  if (pageSize !== undefined) data.pageSize = pageSize;
  if (pageOrientation !== undefined) data.pageOrientation = pageOrientation;
  if (pageWidthMm !== undefined) data.pageWidthMm = toDecimalOrNull(pageWidthMm);
  if (pageHeightMm !== undefined) data.pageHeightMm = toDecimalOrNull(pageHeightMm);
  if (marginTopMm !== undefined) data.marginTopMm = toDecimal(marginTopMm);
  if (marginBottomMm !== undefined) data.marginBottomMm = toDecimal(marginBottomMm);
  if (marginLeftMm !== undefined) data.marginLeftMm = toDecimal(marginLeftMm);
  if (marginRightMm !== undefined) data.marginRightMm = toDecimal(marginRightMm);
  if (bodyFontFamily !== undefined) data.bodyFontFamily = bodyFontFamily;
  if (bodyFontSizePt !== undefined) data.bodyFontSizePt = toInt(bodyFontSizePt);
  if (heading1FontSizePt !== undefined) data.heading1FontSizePt = toInt(heading1FontSizePt);
  if (heading2FontSizePt !== undefined) data.heading2FontSizePt = toInt(heading2FontSizePt);
  if (heading3FontSizePt !== undefined) data.heading3FontSizePt = toInt(heading3FontSizePt);
  if (headingFontFamily !== undefined) data.headingFontFamily = headingFontFamily;
  if (headingFontBold !== undefined) data.headingFontBold = toBool(headingFontBold);
  if (tableFontFamily !== undefined) data.tableFontFamily = tableFontFamily;
  if (tableFontSizePt !== undefined) data.tableFontSizePt = toInt(tableFontSizePt);
  if (lineSpacing !== undefined) data.lineSpacing = toDecimal(lineSpacing);
  if (paragraphSpacingBeforePt !== undefined) data.paragraphSpacingBeforePt = toInt(paragraphSpacingBeforePt);
  if (paragraphSpacingAfterPt !== undefined) data.paragraphSpacingAfterPt = toInt(paragraphSpacingAfterPt);
  if (headerEnabled !== undefined) data.headerEnabled = toBool(headerEnabled);
  if (headerHeightMm !== undefined) data.headerHeightMm = toDecimalOrNull(headerHeightMm);
  if (headerLogoPath !== undefined) data.headerLogoPath = headerLogoPath;
  if (headerUseCustomImage !== undefined) data.headerUseCustomImage = toBool(headerUseCustomImage);
  if (headerCustomImagePath !== undefined) data.headerCustomImagePath = headerCustomImagePath;
  if (headerCustomImageWidthMm !== undefined) data.headerCustomImageWidthMm = toDecimalOrNull(headerCustomImageWidthMm);
  if (headerLeftText !== undefined) data.headerLeftText = headerLeftText;
  if (headerCenterText !== undefined) data.headerCenterText = headerCenterText;
  if (headerRightText !== undefined) data.headerRightText = headerRightText;
  if (headerBorderBottomStyle !== undefined) data.headerBorderBottomStyle = headerBorderBottomStyle;
  if (footerEnabled !== undefined) data.footerEnabled = toBool(footerEnabled);
  if (footerHeightMm !== undefined) data.footerHeightMm = toDecimalOrNull(footerHeightMm);
  if (footerUseCustomImage !== undefined) data.footerUseCustomImage = toBool(footerUseCustomImage);
  if (footerCustomImagePath !== undefined) data.footerCustomImagePath = footerCustomImagePath;
  if (footerCustomImageWidthMm !== undefined) data.footerCustomImageWidthMm = toDecimalOrNull(footerCustomImageWidthMm);
  if (footerLeftText !== undefined) data.footerLeftText = footerLeftText;
  if (footerCenterText !== undefined) data.footerCenterText = footerCenterText;
  if (footerRightText !== undefined) data.footerRightText = footerRightText;
  if (showPageNumbers !== undefined) data.showPageNumbers = toBool(showPageNumbers);
  if (pageNumberFormat !== undefined) data.pageNumberFormat = pageNumberFormat;
  if (showDocumentInfo !== undefined) data.showDocumentInfo = toBool(showDocumentInfo);
  if (footerBorderTopStyle !== undefined) data.footerBorderTopStyle = footerBorderTopStyle;
  if (tableBorderStyle !== undefined) data.tableBorderStyle = tableBorderStyle;
  if (tableBorderWidthPt !== undefined) data.tableBorderWidthPt = toDecimal(tableBorderWidthPt);
  if (tableHeaderFillColor !== undefined) data.tableHeaderFillColor = tableHeaderFillColor;
  if (tableHeaderFontBold !== undefined) data.tableHeaderFontBold = toBool(tableHeaderFontBold);
  if (tableCellPaddingPt !== undefined) data.tableCellPaddingPt = toInt(tableCellPaddingPt);
  if (tableAlignment !== undefined) data.tableAlignment = tableAlignment;
  if (pageBreakBeforeHeadings !== undefined) data.pageBreakBeforeHeadings = toBool(pageBreakBeforeHeadings);
  if (widowOrphanControl !== undefined) data.widowOrphanControl = toBool(widowOrphanControl);
  if (firstPageNumber !== undefined) data.firstPageNumber = toInt(firstPageNumber);
  if (restartOnEachSection !== undefined) data.restartOnEachSection = toBool(restartOnEachSection);
  if (useHybridPageNumbering !== undefined) data.useHybridPageNumbering = toBool(useHybridPageNumbering);
  if (frontMatterThreshold !== undefined) data.frontMatterThreshold = toInt(frontMatterThreshold);
  if (frontMatterFormat !== undefined) data.frontMatterFormat = String(frontMatterFormat);
  if (heading4FontSizePt !== undefined) data.heading4FontSizePt = toInt(heading4FontSizePt);
  if (typographyJson !== undefined) data.typographyJson = typographyJson;
  if (headerUseProfessionalLayout !== undefined) data.headerUseProfessionalLayout = toBool(headerUseProfessionalLayout);
  if (logoWidthMm !== undefined) data.logoWidthMm = toDecimalOrNull(logoWidthMm);
  if (logoHeightMm !== undefined) data.logoHeightMm = toDecimalOrNull(logoHeightMm);
  if (headerCompanyName !== undefined) data.headerCompanyName = headerCompanyName;
  if (headerCompanyRegNo !== undefined) data.headerCompanyRegNo = headerCompanyRegNo;
  if (headerCompanyNameUnderline !== undefined) data.headerCompanyNameUnderline = toBool(headerCompanyNameUnderline);
  if (headerCompanyNameColor !== undefined) data.headerCompanyNameColor = headerCompanyNameColor;
  if (headerCompanyAddressJson !== undefined) data.headerCompanyAddressJson = headerCompanyAddressJson;
  if (headerCompanyPhone !== undefined) data.headerCompanyPhone = headerCompanyPhone;
  if (headerCompanyEmail !== undefined) data.headerCompanyEmail = headerCompanyEmail;
  if (headerCompanyEmailColor !== undefined) data.headerCompanyEmailColor = headerCompanyEmailColor;
  if (headerBottomDividerEnabled !== undefined) data.headerBottomDividerEnabled = toBool(headerBottomDividerEnabled);
  if (headerBottomDividerWidthPt !== undefined) data.headerBottomDividerWidthPt = toDecimal(headerBottomDividerWidthPt);
  if (headerBottomDividerColor !== undefined) data.headerBottomDividerColor = headerBottomDividerColor;
  if (footerUseProfessionalLayout !== undefined) data.footerUseProfessionalLayout = toBool(footerUseProfessionalLayout);
  if (footerConfidentialText !== undefined) data.footerConfidentialText = footerConfidentialText;
  if (footerClassificationMark !== undefined) data.footerClassificationMark = footerClassificationMark;
  if (footerShowDocCodeAndRev !== undefined) data.footerShowDocCodeAndRev = toBool(footerShowDocCodeAndRev);
  if (footerShowEffectiveDate !== undefined) data.footerShowEffectiveDate = toBool(footerShowEffectiveDate);
  if (footerShowPreparedBy !== undefined) data.footerShowPreparedBy = toBool(footerShowPreparedBy);
  if (footerShowApprovedBy !== undefined) data.footerShowApprovedBy = toBool(footerShowApprovedBy);
  if (footerDisclaimerText !== undefined) data.footerDisclaimerText = footerDisclaimerText;
  if (footerTopDividerEnabled !== undefined) data.footerTopDividerEnabled = toBool(footerTopDividerEnabled);
  if (footerTopDividerWidthPt !== undefined) data.footerTopDividerWidthPt = toDecimal(footerTopDividerWidthPt);
  if (footerTopDividerColor !== undefined) data.footerTopDividerColor = footerTopDividerColor;

  const lockedVersionCount = await prisma.smartTemplateVersion.count({
    where: {
      isLocked: true,
      smartTemplate: { styleProfileId: profileId }
    }
  });

  if (lockedVersionCount > 0) {
    const hasSensitiveChange = Object.keys(data).some(
      (k) => k !== 'isActive' && k !== 'isDefault'
    );
    if (hasSensitiveChange) {
      console.warn(
        `[StyleProfile] Admin editing style profile #${profileId} which is referenced by ${lockedVersionCount} LOCKED Smart Template Version(s). ` +
        `Past outputs are protected by each locked version's formattingSnapshot (taken at publish/lock time). ` +
        `This save will affect NEW documents created going-forward. Affected locked version count: ${lockedVersionCount}. ` +
        `Changed keys: ${Object.keys(data).filter(k => k !== 'isActive' && k !== 'isDefault').join(', ')}`
      );
    }
  }

  const styleProfile = await prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.smartDocumentStyleProfile.updateMany({
        where: { isDefault: true, id: { not: profileId } },
        data: { isDefault: false }
      });
    }

    return await tx.smartDocumentStyleProfile.update({
      where: { id: profileId },
      data
    });
  });

  return ResponseFormatter.success(
    res,
    { styleProfile },
    'Style profile updated successfully'
  );
});

exports.deleteStyleProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profileId = parseInt(id, 10);

  if (isNaN(profileId)) {
    return ResponseFormatter.error(res, 'Invalid profile ID', 400);
  }

  const existing = await prisma.smartDocumentStyleProfile.findUnique({
    where: { id: profileId }
  });

  if (!existing) {
    return ResponseFormatter.error(res, 'Style profile not found', 404);
  }

  if (existing.isDefault === true) {
    return ResponseFormatter.error(
      res,
      'Cannot delete the default style profile. Set another profile as default first.',
      400
    );
  }

  const referencingTemplates = await prisma.smartTemplate.count({
    where: { styleProfileId: profileId }
  });

  if (referencingTemplates > 0) {
    return ResponseFormatter.error(
      res,
      `Cannot delete style profile. It is currently used by ${referencingTemplates} Smart Template(s). Please reassign those templates first.`,
      400
    );
  }

  await prisma.smartDocumentStyleProfile.delete({
    where: { id: profileId }
  });

  return ResponseFormatter.success(
    res,
    null,
    'Style profile deleted successfully'
  );
});

exports.setDefaultStyleProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profileId = parseInt(id, 10);

  if (isNaN(profileId)) {
    return ResponseFormatter.error(res, 'Invalid profile ID', 400);
  }

  const existing = await prisma.smartDocumentStyleProfile.findUnique({
    where: { id: profileId }
  });

  if (!existing) {
    return ResponseFormatter.error(res, 'Style profile not found', 404);
  }

  if (!existing.isActive) {
    return ResponseFormatter.error(res, 'Cannot set an inactive profile as default', 400);
  }

  const styleProfile = await prisma.$transaction(async (tx) => {
    await tx.smartDocumentStyleProfile.updateMany({
      where: { isDefault: true, id: { not: profileId } },
      data: { isDefault: false }
    });

    return await tx.smartDocumentStyleProfile.update({
      where: { id: profileId },
      data: { isDefault: true }
    });
  });

  return ResponseFormatter.success(
    res,
    { styleProfile },
    'Default style profile set successfully'
  );
});

exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) {
    return ResponseFormatter.error(res, 'No file uploaded', 400);
  }

  const logoPath = `/uploads/branding/logos/${req.file.filename}`;
  const originalName = req.file.originalname;
  const sizeKb = Math.round(req.file.size / 1024);

  return ResponseFormatter.success(
    res,
    {
      logoPath,
      originalName,
      sizeKb,
      filename: req.file.filename
    },
    'Logo uploaded successfully'
  );
});

exports.uploadHeaderCustomImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return ResponseFormatter.error(res, 'No file uploaded', 400);
  }

  const imagePath = `/uploads/branding/smart-headers/${req.file.filename}`;
  const originalName = req.file.originalname;
  const sizeKb = Math.round(req.file.size / 1024);

  return ResponseFormatter.success(
    res,
    {
      imagePath,
      originalName,
      sizeKb,
      filename: req.file.filename
    },
    'Header custom image uploaded successfully'
  );
});

exports.uploadFooterCustomImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return ResponseFormatter.error(res, 'No file uploaded', 400);
  }

  const imagePath = `/uploads/branding/smart-headers/${req.file.filename}`;
  const originalName = req.file.originalname;
  const sizeKb = Math.round(req.file.size / 1024);

  return ResponseFormatter.success(
    res,
    {
      imagePath,
      originalName,
      sizeKb,
      filename: req.file.filename
    },
    'Footer custom image uploaded successfully'
  );
});
