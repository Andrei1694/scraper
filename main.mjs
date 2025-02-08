import axios from 'axios';
import fs from 'fs';
import puppeteer from 'puppeteer';
import path from 'path';

const links = [];
let offset = 0;
const limit = 20;

const delay = ms => new Promise(res => setTimeout(res, ms));

const fetchArticles = async (URL) => {
	try {
		const response = await axios.get(URL);
		return [response.data, response.status];
	} catch (error) {
		console.error('Error fetching articles:', error.message);
		return [[], error.response?.status || 500];
	}
};

const downloadAsPDF = async (browser, url, filename) => {
	try {
		const page = await browser.newPage();

		// Set viewport for better PDF rendering
		await page.setViewport({ width: 1200, height: 800 });

		// Navigate to the URL with a timeout of 30 seconds
		await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

		// Wait for the article content to load
		await page.waitForSelector('article', { timeout: 10000 });

		// Create PDFs directory if it doesn't exist
		const pdfDir = path.join(process.cwd(), 'pdfs');
		if (!fs.existsSync(pdfDir)) {
			fs.mkdirSync(pdfDir);
		}

		// Generate PDF
		await page.pdf({
			path: path.join(pdfDir, filename),
			format: 'A4',
			margin: {
				top: '20px',
				right: '20px',
				bottom: '20px',
				left: '20px'
			},
			printBackground: true
		});

		await page.close();
		return true;
	} catch (error) {
		console.error(`Error downloading PDF for ${url}:`, error.message);
		return false;
	}
};

const scrapeAndDownload = async () => {
	let responseStatus = 200;
	const browser = await puppeteer.launch({ headless: "new" });

	try {
		while (responseStatus === 200) {
			await delay(1000);

			const URL = `https://biancaoanea.substack.com/api/v1/archive?sort=new&search=&offset=${offset}&limit=${limit}`;
			const [data, status] = await fetchArticles(URL);

			if (data.length === 0) {
				console.log('No more articles to fetch');
				break;
			}

			// Process the articles
			for (const [index, article] of data.entries()) {
				const articleId = offset + index + 1;
				links.push({
					id: articleId,
					url: article.canonical_url,
				});

				// Generate filename from article title or ID
				const filename = `article_${articleId}.pdf`;
				console.log(`Downloading ${filename} from ${article.canonical_url}`);

				// Download PDF with retry mechanism
				let success = false;
				for (let attempt = 1; attempt <= 3 && !success; attempt++) {
					if (attempt > 1) {
						console.log(`Retry attempt ${attempt} for ${filename}`);
						await delay(3000); // Wait longer between retries
					}
					success = await downloadAsPDF(browser, article.canonical_url, filename);
				}

				if (success) {
					console.log(`Successfully downloaded ${filename}`);
				} else {
					console.log(`Failed to download ${filename} after 3 attempts`);
				}

				// Delay between article downloads
				await delay(2000);
			}

			responseStatus = status;
			offset += limit;
			console.log(`Processed articles up to offset: ${offset}`);
		}

		// Save links to file
		const jsonString = JSON.stringify(links, null, 2);
		fs.writeFileSync('data.json', jsonString);
		console.log(`Successfully saved ${links.length} article links to data.json`);

	} catch (error) {
		console.error('Error in main process:', error);
	} finally {
		await browser.close();
	}
};

// Run the scraper
scrapeAndDownload().then(() => {
	console.log('Script completed');
}).catch(error => {
	console.error('Script failed:', error);
});