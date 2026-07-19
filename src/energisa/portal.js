// Automação da Agência Digital da Energisa (https://servicos.energisa.com.br).
// A Energisa não oferece API pública, então este módulo dirige um navegador
// real (Playwright/Chromium) para fazer login, listar as faturas em aberto e
// baixar os PDFs — que são a fonte de verdade para a energia injetada.
//
// A sessão logada fica salva em dados/energisa/sessao.json: o login (e um
// eventual captcha) só precisa acontecer de novo quando a sessão expira.

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://servicos.energisa.com.br';

// Seletores centralizados: quando a Energisa mudar o layout do portal, é aqui
// que se ajusta. Cada campo tem alternativas testadas em ordem.
const SELETORES = {
  campoDocumento: [
    'input[name="cpfCnpj"]',
    'input[name="cpf"]',
    'input[name="documento"]',
    'input[placeholder*="CPF" i]',
    'input[placeholder*="CNPJ" i]',
    'input[id*="cpf" i]',
  ],
  campoSenha: ['input[type="password"]'],
  botaoEntrar: [
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Acessar")',
    'button:has-text("Continuar")',
  ],
  captcha: [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '[class*="captcha" i]',
  ],
  linkFaturas: [
    'a[href*="faturas"]',
    'a:has-text("Faturas")',
    'button:has-text("Faturas")',
    'a:has-text("2ª via")',
  ],
  baixarFatura: [
    'button:has-text("Baixar")',
    'a:has-text("Baixar")',
    'button:has-text("2ª via")',
    'a:has-text("2ª via")',
    'button[aria-label*="baixar" i]',
    'a[href$=".pdf"]',
  ],
};

async function primeiroVisivel(page, seletores, timeout = 4000) {
  for (const sel of seletores) {
    const el = page.locator(sel).first();
    try {
      await el.waitFor({ state: 'visible', timeout });
      return el;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

async function temCaptcha(page) {
  for (const sel of SELETORES.captcha) {
    if (await page.locator(sel).count() > 0) return true;
  }
  return false;
}

async function salvarEvidencia(page, dirDados, nome) {
  const dir = path.join(dirDados, 'erros');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `${nome}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
  try {
    await page.screenshot({ path: `${arquivo}.png`, fullPage: true });
    fs.writeFileSync(`${arquivo}.html`, await page.content());
  } catch { /* evidência é melhor esforço */ }
  return `${arquivo}.png`;
}

function estaLogado(page) {
  // Depois do login a URL sai de /login e a página deixa de ter campo de senha.
  return page.url().includes(BASE) && !/login|entrar/i.test(page.url());
}

async function fazerLogin(page, { documento, senha, visivel, dirDados }) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500); // SPA: espera hidratar

  const campoDoc = await primeiroVisivel(page, SELETORES.campoDocumento, 8000);
  if (!campoDoc) {
    // Sem campo de documento visível: ou já está logado (sessão restaurada), ou o layout mudou.
    if (estaLogado(page)) return;
    const print = await salvarEvidencia(page, dirDados, 'login-sem-campo');
    throw new Error(`Não encontrei o campo de CPF/CNPJ na tela de login. O layout do portal pode ter mudado — veja o print em ${print} e ajuste SELETORES em src/energisa/portal.js.`);
  }

  await campoDoc.fill(documento);

  // Alguns fluxos pedem o documento primeiro e a senha na tela seguinte.
  let campoSenha = await primeiroVisivel(page, SELETORES.campoSenha, 2000);
  if (!campoSenha) {
    const btn = await primeiroVisivel(page, SELETORES.botaoEntrar, 3000);
    if (btn) await btn.click();
    campoSenha = await primeiroVisivel(page, SELETORES.campoSenha, 8000);
  }
  if (!campoSenha) {
    const print = await salvarEvidencia(page, dirDados, 'login-sem-senha');
    throw new Error(`Não encontrei o campo de senha. Veja o print em ${print}.`);
  }
  await campoSenha.fill(senha);

  if (await temCaptcha(page)) {
    if (!visivel) {
      throw new Error(
        'O portal da Energisa está pedindo um CAPTCHA, que não dá para resolver em modo invisível. ' +
        'Rode uma vez com a janela visível para resolver manualmente: npm run energisa -- --visivel ' +
        '(a sessão fica salva e as próximas consultas voltam a ser automáticas).'
      );
    }
    console.log('🧩 CAPTCHA detectado — resolva na janela do navegador e conclua o login. Aguardando até 5 minutos...');
    await page.waitForURL((url) => !/login|entrar/i.test(url.href), { timeout: 5 * 60 * 1000 });
  } else {
    const btn = await primeiroVisivel(page, SELETORES.botaoEntrar, 5000);
    if (btn) await btn.click();
    try {
      await page.waitForURL((url) => !/login|entrar/i.test(url.href), { timeout: 30000 });
    } catch {
      const print = await salvarEvidencia(page, dirDados, 'login-nao-avancou');
      throw new Error(`O login não avançou (senha incorreta? verificação por SMS/e-mail?). Veja o print em ${print}. Se o portal pediu um código de verificação, rode com: npm run energisa -- --visivel`);
    }
  }
}

// Faturas normalmente chegam via chamadas JSON do SPA. Capturamos qualquer
// resposta JSON que pareça uma lista de faturas — mais estável que depender
// do HTML — e mantemos o DOM como plano B para os downloads.
function coletorDeFaturasJson(page, capturadas) {
  page.on('response', async (resp) => {
    try {
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const body = await resp.json().catch(() => null);
      if (!body) return;
      const texto = JSON.stringify(body);
      if (/fatura|vencimento|referencia/i.test(texto) && /valor|total/i.test(texto)) {
        capturadas.push({ url: resp.url(), body });
      }
    } catch { /* respostas que não interessam */ }
  });
}

async function baixarFaturasDaTela(page, dirFaturas) {
  const arquivos = [];
  const botoes = [];
  for (const sel of SELETORES.baixarFatura) {
    const els = await page.locator(sel).all();
    botoes.push(...els);
    if (botoes.length) break;
  }
  for (const botao of botoes.slice(0, 12)) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        botao.click(),
      ]);
      const nome = download.suggestedFilename() || `fatura-${arquivos.length + 1}.pdf`;
      const destino = path.join(dirFaturas, nome);
      await download.saveAs(destino);
      arquivos.push(destino);
      console.log(`⬇️  Fatura baixada: ${nome}`);
    } catch { /* botão que não gera download (ex.: "ver detalhes") */ }
  }
  return arquivos;
}

/**
 * Fluxo completo: login → faturas → download dos PDFs em aberto.
 * @returns {Promise<{arquivos: string[], apisCapturadas: object[]}>}
 */
export async function baixarFaturasEmAberto({ documento, senha, dirDados, visivel = false }) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('O Playwright não está instalado. Rode: npm install && npx playwright install chromium');
  }

  fs.mkdirSync(dirDados, { recursive: true });
  const dirFaturas = path.join(dirDados, 'faturas');
  fs.mkdirSync(dirFaturas, { recursive: true });
  const sessaoPath = path.join(dirDados, 'sessao.json');

  const browser = await chromium.launch({ headless: !visivel }).catch(async (err) => {
    if (/executable doesn't exist|browserType.launch/i.test(err.message)) {
      throw new Error('O navegador do Playwright não está instalado. Rode: npx playwright install chromium');
    }
    throw err;
  });

  try {
    const context = await browser.newContext({
      storageState: fs.existsSync(sessaoPath) ? sessaoPath : undefined,
      acceptDownloads: true,
      locale: 'pt-BR',
    });
    const page = await context.newPage();
    const apisCapturadas = [];
    coletorDeFaturasJson(page, apisCapturadas);

    // Vai direto para as faturas; se a sessão expirou o portal redireciona ao login.
    await page.goto(`${BASE}/faturas`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (!estaLogado(page) || (await page.locator('input[type="password"]').count()) > 0) {
      console.log('🔐 Sessão expirada ou primeiro acesso — fazendo login...');
      await fazerLogin(page, { documento, senha, visivel, dirDados });
      await context.storageState({ path: sessaoPath });
      await page.goto(`${BASE}/faturas`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
    }

    // Se o portal pede para escolher a unidade consumidora, percorre todas.
    const arquivos = await baixarFaturasDaTela(page, dirFaturas);

    if (!arquivos.length) {
      const print = await salvarEvidencia(page, dirDados, 'faturas-nada-baixado');
      console.warn(`⚠️  Nenhum PDF baixado automaticamente. Print da tela salvo em ${print} — pode ser que não haja fatura em aberto, ou o layout mudou (ajuste SELETORES em src/energisa/portal.js).`);
    }

    // Guarda as respostas JSON capturadas para depuração/extração futura.
    if (apisCapturadas.length) {
      const debugPath = path.join(dirDados, 'apis-capturadas.json');
      fs.writeFileSync(debugPath, JSON.stringify(apisCapturadas, null, 2));
    }

    await context.storageState({ path: sessaoPath });
    return { arquivos, apisCapturadas };
  } finally {
    await browser.close();
  }
}
