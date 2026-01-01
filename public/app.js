document.addEventListener('DOMContentLoaded', async () => {
    const newsContainer = document.getElementById('news-container');
    const dateElement = document.getElementById('current-date');
    const header = document.getElementById('main-header');
    const toggleBtn = document.getElementById('header-toggle-btn');

    // Toggle Header
    if (toggleBtn && header) {
        toggleBtn.addEventListener('click', () => {
            header.classList.toggle('collapsed');
        });
    }

    try {
        const response = await fetch('data/latest.json');
        if (!response.ok) throw new Error('Failed to fetch news data');

        const data = await response.json();

        // Update Date
        const updatedDate = new Date(data.updated_at);
        dateElement.textContent = updatedDate.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        // Render Articles
        newsContainer.innerHTML = '';
        data.articles.forEach(article => {
            const card = createNewsCard(article);
            newsContainer.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        newsContainer.innerHTML = `
            <div class="loading">
                <p>ニュースの読み込みに失敗しました。</p>
                <p>しばらくしてから再読み込みしてください。</p>
            </div>
        `;
    }
});

function createNewsCard(article) {
    const card = document.createElement('article');
    card.className = 'card';

    const publishedTime = new Date(article.published_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    // Optional Image
    let imageHtml = '';
    if (article.image_url) {
        // Use error handling for images to hide broken ones? For now simple img tag.
        imageHtml = `<img src="${article.image_url}" class="card-image" alt="Article Image" loading="lazy">`;
    }

    // Optional Japanese Title
    let titleJaHtml = '';
    if (article.title_ja) {
        titleJaHtml = `<h3 class="title-ja">${article.title_ja}</h3>`;
    }

    card.innerHTML = `
        ${imageHtml}
        <div class="card-source">
            <span>${article.source || 'Unknown Source'}</span>
            <span>${publishedTime}</span>
        </div>
        <h2><a href="${article.original_url}" target="_blank" rel="noopener noreferrer">${article.title}</a></h2>
        ${titleJaHtml}
        <p>${article.summary_ja}</p>
    `;

    return card;
}
