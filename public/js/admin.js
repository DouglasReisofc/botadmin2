// public/js/admin.js

// Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// Submenu Toggle
document.querySelectorAll('.nav-link').forEach(link => {
    const chevron = link.querySelector('.fa-chevron-down');
    if (!chevron) return;
    link.addEventListener('click', e => {
        e.preventDefault();
        const submenu = link.parentElement.querySelector('.sub-menu');
        if (submenu) submenu.classList.toggle('open');
        chevron.classList.toggle('rotate');
    });
});

// Abrir modal genérico
function openModalById(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('no-scroll');
    const handler = evt => {
        if (evt.target === modal) closeModal(id);
    };
    modal.addEventListener('click', handler);
    modal._closer = handler;
}

// Fechar modal genérico
function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('no-scroll');
    if (modal._closer) {
        modal.removeEventListener('click', modal._closer);
        modal._closer = null;
    }
}

// Fecha sidebar ao clicar fora em telas pequenas
window.addEventListener('click', event => {
    const sidebar = document.querySelector('.sidebar');
    const toggle = document.querySelector('.menu-toggle');
    if (
        sidebar &&
        window.innerWidth <= 768 &&
        !event.target.closest('.sidebar') &&
        !(toggle && event.target.closest('.menu-toggle'))
    ) {
        sidebar.classList.remove('active');
    }
});

// Menu de perfil
function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    if (!menu) return;
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
}

// Fecha menu de perfil clicando fora
document.addEventListener('click', event => {
    const menu = document.getElementById('profile-menu');
    const btn = document.querySelector('.header-btn');
    if (
        menu && btn &&
        !btn.contains(event.target) &&
        !menu.contains(event.target)
    ) {
        menu.style.display = 'none';
    }
});
