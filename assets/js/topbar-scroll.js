document.addEventListener('DOMContentLoaded', function () {
  var topbar = document.getElementById('topbar-wrapper');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 0) {
      topbar.classList.add('scrolled');
    } else {
      topbar.classList.remove('scrolled');
    }
  });
});
