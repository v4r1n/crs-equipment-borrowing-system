function getAppBootstrap() {
  return executeSafely_(function () {
    var user = requireUser_(true);
    var config = getRuntimeConfig_();
    return {
      app: {
        name: config.APP_NAME,
        version: config.APP_VERSION,
        timezone: config.TIMEZONE,
        locale: config.LOCALE,
        webAppUrl: getWebAppBaseUrl_(),
        maxImageBytes: config.MAX_IMAGE_BYTES
      },
      session: getSessionDto_(user),
      enums: {
        equipmentStatus: cloneObject_(EQUIPMENT_STATUS),
        borrowStatus: cloneObject_(BORROW_STATUS),
        returnCondition: cloneObject_(RETURN_CONDITION),
        returnDisposition: cloneObject_(RETURN_DISPOSITION),
        userRole: cloneObject_(USER_ROLE),
        recordStatus: cloneObject_(RECORD_STATUS)
      },
      categories: activeCategoryDtos_()
    };
  });
}

function getDashboard() {
  return executeSafely_(function () {
    var user = requireUser_(true);
    return user.role === USER_ROLE.ADMIN ? getAdminDashboard_() : getUserDashboard_(user);
  });
}

function listEquipment(query) {
  return executeSafely_(function () {
    requireUser_(true);
    return listEquipment_(query || {});
  });
}

function getEquipmentDetail(assetId) {
  return executeSafely_(function () {
    requireUser_(true);
    return getEquipmentDetail_(assetId);
  });
}

function listCategories() {
  return executeSafely_(function () {
    requireUser_(true);
    return activeCategoryDtos_();
  });
}

function createBorrowRequest(input) {
  return executeSafely_(function () {
    var actor = requireUser_(true);
    return createBorrowRequest_(input || {}, actor);
  });
}

function listMyBorrowing(query) {
  return executeSafely_(function () {
    var user = requireUser_(true);
    return listMyBorrowing_(query || {}, user);
  });
}

function getBorrowDetail(borrowId) {
  return executeSafely_(function () {
    var user = requireUser_(true);
    return getBorrowDetail_(borrowId, user);
  });
}

function requestReturn(input) {
  return executeSafely_(function () {
    var actor = requireUser_(true);
    return requestReturn_(input || {}, actor);
  });
}

function listMyHistory(query) {
  return executeSafely_(function () {
    var user = requireUser_(true);
    return listHistoryForUser_(query || {}, user);
  });
}

function adminGetDashboard() {
  return executeSafely_(function () {
    requireAdmin_(true);
    return getAdminDashboard_();
  });
}

function adminListBorrowing(query) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return listBorrowingForAdmin_(query || {});
  });
}

function adminApproveBorrow(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return approveBorrow_(input || {}, actor);
  });
}

function adminRejectBorrow(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return rejectBorrow_(input || {}, actor);
  });
}

function adminCheckoutBorrow(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return checkoutBorrow_(input || {}, actor);
  });
}

function adminCompleteReturn(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return completeReturn_(input || {}, actor);
  });
}

function adminCreateEquipment(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return createEquipment_(input || {}, actor);
  });
}

function adminUpdateEquipment(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return updateEquipment_(input || {}, actor);
  });
}

function adminChangeEquipmentStatus(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return changeEquipmentStatus_(input || {}, actor);
  });
}

function adminUploadEquipmentImage(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return uploadEquipmentImage_(input || {}, actor);
  });
}

function adminListUsers(query) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return listUsersForAdmin_(query || {});
  });
}

function adminCreateUser(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return createUser_(input || {}, actor);
  });
}

function adminUpdateUser(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return updateUser_(input || {}, actor);
  });
}

function adminListCategories(query) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return listCategoriesForAdmin_(query || {});
  });
}

function adminCreateCategory(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return createCategory_(input || {}, actor);
  });
}

function adminUpdateCategory(input) {
  return executeSafely_(function () {
    var actor = requireAdmin_(true);
    return updateCategory_(input || {}, actor);
  });
}

function adminListHistory(query) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return listHistoryForAdmin_(query || {});
  });
}

function adminRunIntegrityAudit() {
  return executeSafely_(function () {
    requireAdmin_(true);
    return runIntegrityAudit_();
  });
}

function adminListOperations(query) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return listOperationsForAdmin_(query || {});
  });
}

function adminGetOperationDetail(operationId) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return getOperationDetailForAdmin_(operationId);
  });
}

function adminReconcileOperation(operationId) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return reconcileOperationForAdmin_(operationId);
  });
}

function adminAbortOperation(input) {
  return executeSafely_(function () {
    requireAdmin_(true);
    return abortOperationForAdmin_(input || {});
  });
}

function activeCategoryDtos_() {
  return listRecords_(SHEETS.CATEGORIES).filter(function (category) {
    return category.status === RECORD_STATUS.ACTIVE;
  }).sort(function (left, right) {
    var orderDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    return orderDifference || stripSheetEscape_(left.category_name)
      .localeCompare(stripSheetEscape_(right.category_name), 'th');
  }).map(function (category) {
    return selectClientFields_(category,
      ['category_id', 'category_name', 'prefix', 'sort_order', 'status']);
  });
}
