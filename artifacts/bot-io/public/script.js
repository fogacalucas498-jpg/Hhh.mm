// 1. Tabs dos benefícios
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
  });
});

// 2. Toggle de preço (mensal/trimestral)
document.getElementById('billingToggle')?.addEventListener('change', function() {
  const monthly = document.querySelectorAll('.monthly-price');
  const quarterly = document.querySelectorAll('.quarterly-price');
  if (this.checked) {
    monthly.forEach(el => el.style.display = 'none');
    quarterly.forEach(el => el.style.display = 'inline');
  } else {
    monthly.forEach(el => el.style.display = 'inline');
    quarterly.forEach(el => el.style.display = 'none');
  }
});

// 3. Mobile menu toggle
document.getElementById('mobileToggle')?.addEventListener('click', () => {
  document.querySelector('.nav-links')?.classList.toggle('open');
});

// 4. Navbar scroll shadow
window.addEventListener('scroll', () => {
  document.querySelector('.navbar')?.classList.toggle('scrolled', window.scrollY > 20);
});

// 5. Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});
