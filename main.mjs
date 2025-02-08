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

const sanitizeFilename = (text) => {
	const replacements = {
		'ă': 'a', 'â': 'a', 'ș': 's', 'ş': 's', 'ț': 't', 'ţ': 't', 'î': 'i',
		'Ă': 'A', 'Â': 'A', 'Ș': 'S', 'Ş': 'S', 'Ț': 'T', 'Ţ': 'T', 'Î': 'I'
	};
	return text.replace(/[ăâșşțţîĂÂȘŞȚŢÎ]/g, match => replacements[match])
		.replace(/[^a-zA-Z0-9.-]/g, '-')
		.toLowerCase();
};

const downloadAsPDF = async (browser, url, filename) => {
	const COOKIE = {
		name: "substack.sid",
		value: "s:f7QQ-N-dtHPgoClmM04AuCE5XGQOYP6b.RIGOdPGBbLJRDG6aevCcPTxMuMiJ451OT5qFUcRQKpA",
		domain: "bodyengineering.substack.com",
		path: "/",
		expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // expires in 24 hours
		httpOnly: true,
		secure: true,
		sameSite: "Strict",
	};
	try {
		const page = await browser.newPage();
		await page.setCookie(COOKIE);
		await page.setViewport({ width: 1200, height: 800 });
		await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
		await page.waitForSelector('article', { timeout: 10000 });

		const pdfDir = path.join(process.cwd(), 'pdfs');
		if (!fs.existsSync(pdfDir)) {
			fs.mkdirSync(pdfDir);
		}

		await page.pdf({
			path: path.join(pdfDir, filename),
			format: 'A4',
			printBackground: true,
			preferCSSPageSize: true,
			timeout: 60000,
			margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
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
			const URL = `https://bodyengineering.substack.com/api/v1/archive?sort=new&search=&offset=${offset}&limit=${limit}`;
			const [data, status] = await fetchArticles(URL);
			if (data.length === 0) {
				console.log('No more articles to fetch');
				break;
			}

			for (const [index, article] of data.entries()) {
				const articleId = offset + index + 1;
				const sanitizedTitle = sanitizeFilename(article.title);
				const filename = `${articleId}.${sanitizedTitle}.pdf`;
				links.push({ id: articleId, url: article.canonical_url });

				console.log(`Downloading ${filename} from ${article.canonical_url}`);
				let success = false;
				for (let attempt = 1; attempt <= 3 && !success; attempt++) {
					if (attempt > 1) {
						console.log(`Retry attempt ${attempt} for ${filename}`);
						await delay(3000);
					}
					success = await downloadAsPDF(browser, article.canonical_url, filename);
				}
				if (success) {
					console.log(`Successfully downloaded ${filename}`);
				} else {
					console.log(`Failed to download ${filename} after 3 attempts`);
				}
				await delay(2000);
			}

			responseStatus = status;
			offset += limit;
			console.log(`Processed articles up to offset: ${offset}`);
		}

		fs.writeFileSync('data.json', JSON.stringify(links, null, 2));
		console.log(`Successfully saved ${links.length} article links to data.json`);
	} catch (error) {
		console.error('Error in main process:', error);
	} finally {
		await browser.close();
	}
};

scrapeAndDownload().then(() => {
	console.log('Script completed');
}).catch(error => {
	console.error('Script failed:', error);
});
