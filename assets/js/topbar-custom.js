document.addEventListener('DOMContentLoaded', function () {
  const topbar = document.getElementById('topbar-wrapper');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 0) {
      topbar.classList.add('scrolled');
    } else {
      topbar.classList.remove('scrolled');
    }
  });

  const menuTrigger = document.querySelector('#topbar-menu-trigger');

  menuTrigger.addEventListener('click', () => {
    if (topbar.classList.contains('mobile-menu-opened')) {
      topbar.classList.remove('mobile-menu-opened');
    } else {
      topbar.classList.add('mobile-menu-opened');
    }
  });
});
