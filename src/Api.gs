function executeUserRpc_(idToken, handler) {
  return executeSafely_(function () {
    return handler(requireUser_(idToken));
  });
}

function executeAdminRpc_(idToken, handler) {
  return executeSafely_(function () {
    return handler(requireAdmin_(idToken));
  });
}

function getAppBootstrap(idToken) {
  return executeUserRpc_(idToken, function (user) {
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

function getDashboard(idToken) {
  return executeUserRpc_(idToken, function (user) {
    return user.role === USER_ROLE.ADMIN ? getAdminDashboard_(user) : getUserDashboard_(user);
  });
}

function listEquipment(idToken, query) {
  return executeUserRpc_(idToken, function (user) {
    return listEquipment_(query || {}, user);
  });
}

function getEquipmentDetail(idToken, assetId) {
  return executeUserRpc_(idToken, function (user) {
    return getEquipmentDetail_(assetId, user);
  });
}

function listCategories(idToken) {
  return executeUserRpc_(idToken, function () {
    return activeCategoryDtos_();
  });
}

function createBorrowRequest(idToken, input) {
  return executeUserRpc_(idToken, function (actor) {
    return createBorrowRequest_(input || {}, actor);
  });
}

function listMyBorrowing(idToken, query) {
  return executeUserRpc_(idToken, function (user) {
    return listMyBorrowing_(query || {}, user);
  });
}

function getBorrowDetail(idToken, borrowId) {
  return executeUserRpc_(idToken, function (user) {
    return getBorrowDetail_(borrowId, user);
  });
}

function requestReturn(idToken, input) {
  return executeUserRpc_(idToken, function (actor) {
    return requestReturn_(input || {}, actor);
  });
}

function listMyHistory(idToken, query) {
  return executeUserRpc_(idToken, function (user) {
    return listHistoryForUser_(query || {}, user);
  });
}

function adminGetDashboard(idToken) {
  return executeAdminRpc_(idToken, function (actor) {
    return getAdminDashboard_(actor);
  });
}

function adminListBorrowing(idToken, query) {
  return executeAdminRpc_(idToken, function (actor) {
    return listBorrowingForAdmin_(query || {}, actor);
  });
}

function adminApproveBorrow(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return approveBorrow_(input || {}, actor);
  });
}

function adminRejectBorrow(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return rejectBorrow_(input || {}, actor);
  });
}

function adminCheckoutBorrow(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return checkoutBorrow_(input || {}, actor);
  });
}

function adminCompleteReturn(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return completeReturn_(input || {}, actor);
  });
}

function adminCreateEquipment(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return createEquipment_(input || {}, actor);
  });
}

function adminUpdateEquipment(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return updateEquipment_(input || {}, actor);
  });
}

function adminChangeEquipmentStatus(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return changeEquipmentStatus_(input || {}, actor);
  });
}

function adminUploadEquipmentImage(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return uploadEquipmentImage_(input || {}, actor);
  });
}

function adminListUsers(idToken, query) {
  return executeAdminRpc_(idToken, function (actor) {
    return listUsersForAdmin_(query || {}, actor);
  });
}

function adminCreateUser(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return createUser_(input || {}, actor);
  });
}

function adminUpdateUser(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return updateUser_(input || {}, actor);
  });
}

function adminListCategories(idToken, query) {
  return executeAdminRpc_(idToken, function (actor) {
    return listCategoriesForAdmin_(query || {}, actor);
  });
}

function adminCreateCategory(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return createCategory_(input || {}, actor);
  });
}

function adminUpdateCategory(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return updateCategory_(input || {}, actor);
  });
}

function adminListHistory(idToken, query) {
  return executeAdminRpc_(idToken, function (actor) {
    return listHistoryForAdmin_(query || {}, actor);
  });
}

function adminRunIntegrityAudit(idToken) {
  return executeAdminRpc_(idToken, function (actor) {
    return runIntegrityAudit_(actor);
  });
}

function adminListOperations(idToken, query) {
  return executeAdminRpc_(idToken, function (actor) {
    return listOperationsForAdmin_(query || {}, actor);
  });
}

function adminGetOperationDetail(idToken, operationId) {
  return executeAdminRpc_(idToken, function (actor) {
    return getOperationDetailForAdmin_(operationId, actor);
  });
}

function adminReconcileOperation(idToken, operationId) {
  return executeAdminRpc_(idToken, function (actor) {
    return reconcileOperationForAdmin_(operationId, actor);
  });
}

function adminAbortOperation(idToken, input) {
  return executeAdminRpc_(idToken, function (actor) {
    return abortOperationForAdmin_(input || {}, actor);
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
