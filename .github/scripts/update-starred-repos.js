const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const GITHUB_USERNAME = GITHUB_REPOSITORY.split('/')[0];
const API_BASE = 'https://api.github.com';

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'GitHub-Actions-Script',
        ...headers
      }
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ data: JSON.parse(data), headers: res.headers });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllStarredRepos() {
  if (!GITHUB_USERNAME) {
    throw new Error('GITHUB_REPOSITORY environment variable not set');
  }

  const headers = GITHUB_TOKEN ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {};
  let allRepos = [];
  let page = 1;
  let hasMore = true;

  console.log(`Fetching starred repositories for ${GITHUB_USERNAME}...`);

  while (hasMore) {
    const url = `${API_BASE}/users/${GITHUB_USERNAME}/starred?per_page=100&page=${page}`;
    const { data, headers: responseHeaders } = await httpsGet(url, headers);

    allRepos = allRepos.concat(data);
    console.log(`Fetched page ${page}: ${data.length} repos`);

    const linkHeader = responseHeaders['link'];
    hasMore = linkHeader && linkHeader.includes('rel="next"');
    page++;
  }

  console.log(`Total starred repos: ${allRepos.length}`);
  return allRepos;
}

function generateProjectHTML(repos) {
  return repos
    .filter(repo => !repo.fork && !repo.archived && repo.owner.login === GITHUB_USERNAME)
    .sort((a, b) => new Date(b.starred_at || b.created_at) - new Date(a.starred_at || a.created_at))
    .map(repo => {
      const description = repo.description || 'No description available';
      return `                <div class="project-item">
                    <h3>${escapeHtml(repo.name)}</h3>
                    <p>${escapeHtml(description)}</p>
                    <a href="${escapeHtml(repo.html_url)}" target="_blank">View on GitHub →</a>
                </div>`;
    })
    .join('\n\n');
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function updateIndexHTML(projectsHTML) {
  const indexPath = path.join(process.cwd(), 'index.html');
  let content = fs.readFileSync(indexPath, 'utf8');

  const projectListRegex = /(<div class="project-list">)([\s\S]*?)(<\/div>\s*<\/section>)/;

  if (!projectListRegex.test(content)) {
    throw new Error('Could not find project-list section in index.html');
  }

  const newContent = content.replace(
    projectListRegex,
    `$1\n${projectsHTML}\n            $3`
  );

  fs.writeFileSync(indexPath, newContent, 'utf8');
  console.log('Updated index.html successfully');
}

async function main() {
  try {
    const repos = await fetchAllStarredRepos();
    const projectsHTML = generateProjectHTML(repos);
    await updateIndexHTML(projectsHTML);
    console.log('✓ Starred repos updated successfully');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
