(function (global) {
  'use strict';

  var modalInstances = new WeakMap();
  var toastInstances = new WeakMap();
  var tabInstances = new WeakMap();

  function emit(element, name, detail) {
    element.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || null }));
  }

  function Modal(element) {
    this.element = element;
  }

  Modal.prototype.show = function () {
    emit(this.element, 'show.bs.modal');
    this.element.classList.add('show');
    this.element.setAttribute('aria-hidden', 'false');
    this.element.setAttribute('role', 'dialog');
    document.body.classList.add('modal-open');
    emit(this.element, 'shown.bs.modal');
    var focusTarget = this.element.querySelector('[autofocus], button, input, select, textarea');
    if (focusTarget) focusTarget.focus();
  };

  Modal.prototype.hide = function () {
    if (!this.element.classList.contains('show')) return;
    emit(this.element, 'hide.bs.modal');
    this.element.classList.remove('show');
    this.element.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    emit(this.element, 'hidden.bs.modal');
  };

  Modal.getOrCreateInstance = function (element) {
    if (!modalInstances.has(element)) modalInstances.set(element, new Modal(element));
    return modalInstances.get(element);
  };

  function Toast(element, options) {
    this.element = element;
    this.options = options || {};
  }

  Toast.prototype.show = function () {
    this.element.classList.add('show');
    emit(this.element, 'shown.bs.toast');
  };

  Toast.prototype.hide = function () {
    this.element.classList.remove('show');
    emit(this.element, 'hidden.bs.toast');
  };

  Toast.getOrCreateInstance = function (element, options) {
    if (!toastInstances.has(element)) toastInstances.set(element, new Toast(element, options));
    return toastInstances.get(element);
  };

  function Tab(element) {
    this.element = element;
  }

  Tab.prototype.show = function () {
    var container = this.element.closest('[role="tablist"], .nav') || document;
    container.querySelectorAll('[data-bs-toggle="tab"]').forEach(function (tab) {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });
    this.element.classList.add('active');
    this.element.setAttribute('aria-selected', 'true');
    var targetSelector = this.element.getAttribute('data-bs-target') || this.element.getAttribute('href');
    if (targetSelector && targetSelector.charAt(0) === '#') {
      var target = document.querySelector(targetSelector);
      var parent = target && target.parentElement;
      if (parent) parent.querySelectorAll('.tab-pane').forEach(function (pane) {
        pane.classList.remove('active', 'show');
      });
      if (target) target.classList.add('active', 'show');
    }
    emit(this.element, 'shown.bs.tab');
  };

  Tab.getOrCreateInstance = function (element) {
    if (!tabInstances.has(element)) tabInstances.set(element, new Tab(element));
    return tabInstances.get(element);
  };

  document.addEventListener('click', function (event) {
    var dismiss = event.target.closest('[data-bs-dismiss]');
    if (dismiss) {
      var kind = dismiss.getAttribute('data-bs-dismiss');
      if (kind === 'modal') {
        var modal = dismiss.closest('.modal');
        if (modal) Modal.getOrCreateInstance(modal).hide();
      }
      if (kind === 'toast') {
        var toast = dismiss.closest('.toast');
        if (toast) Toast.getOrCreateInstance(toast).hide();
      }
    }
    var tab = event.target.closest('[data-bs-toggle="tab"]');
    if (tab) {
      event.preventDefault();
      Tab.getOrCreateInstance(tab).show();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var openModal = document.querySelector('.modal.show');
    if (openModal) Modal.getOrCreateInstance(openModal).hide();
  });

  global.bootstrap = { Modal: Modal, Toast: Toast, Tab: Tab };
})(window);
