// =============================================================================
// CONSTANTES DE CONFIGURAÇÃO
// =============================================================================

const MARGEM_SEGURANCA_MB = 0.5; // Folga para evitar ultrapassar o limite exato
const DELAY_UI_MS         = 5;   // Pausa mínima para manter a interface fluida
const DELAY_LOG_MS        = 100; // Pausa após mensagens de log visíveis ao utilizador
const DELAY_CONCLUSAO_MS  = 1500;// Tempo que a mensagem de sucesso fica visível
const DELAY_ERRO_MS       = 3000;// Tempo que a mensagem de erro fica visível

// =============================================================================
// REFERÊNCIAS AOS ELEMENTOS DA INTERFACE
// =============================================================================

const dropzone        = document.getElementById('dropzone');
const fileInput       = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const processBtn      = document.getElementById('processBtn');
const btnLabel        = document.getElementById('btnLabel');
const maxSizeInput    = document.getElementById('maxSize');
const loadingOverlay  = document.getElementById('loadingOverlay');
const overlayMessage  = document.getElementById('overlayMessage');

// =============================================================================
// ESTADO DA APLICAÇÃO
// =============================================================================

let selectedFile = null;

// =============================================================================
// FUNÇÕES UTILITÁRIAS
// =============================================================================

/** Pausa a execução por `ms` milissegundos (mantém a UI responsiva). */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Formata bytes em megabytes com duas casas decimais. */
const formatarMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

// =============================================================================
// FUNÇÕES DE INTERFACE
// =============================================================================

/**
 * Atualiza a mensagem no overlay de carregamento.
 * As classes de estilo vivem no CSS (msg-info, msg-success, etc.) —
 * o JS apenas indica o tipo; não define cores nem fontes.
 *
 * @param {string} mensagem - Texto a exibir.
 * @param {'info'|'success'|'warning'|'error'} tipo - Estilo visual da mensagem.
 */
function atualizarOverlay(mensagem, tipo = 'info') {
    overlayMessage.textContent = mensagem;
    overlayMessage.className   = `msg-base msg-${tipo}`;
}

/** Mostra o overlay de carregamento com animação de fade-in. */
function mostrarOverlay() {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.classList.add('flex');
    // O timeout de 10ms permite que o browser aplique o estado inicial antes de animar
    setTimeout(() => loadingOverlay.classList.remove('opacity-0'), 10);
}

/** Esconde o overlay de carregamento com animação de fade-out. */
function esconderOverlay() {
    loadingOverlay.classList.add('opacity-0');
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        loadingOverlay.classList.remove('flex');
    }, 300);
}

/**
 * Coloca o botão em modo de processamento.
 * O ícone SVG permanece no HTML; só o texto é alterado.
 */
function bloquearBotao() {
    processBtn.disabled = true;
    processBtn.classList.add('btn-processando');
    btnLabel.textContent = 'A Processar...';
}

/**
 * Restaura o botão ao estado inicial após o processamento.
 * O ícone SVG não precisa ser reinjetado — já está no HTML.
 */
function restaurarBotao() {
    processBtn.disabled = false;
    processBtn.classList.remove('btn-processando');
    btnLabel.textContent = 'Iniciar Fracionamento';
}

// =============================================================================
// GESTÃO DE FICHEIROS (DRAG & DROP E SELEÇÃO)
// =============================================================================

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');

    const ficheiro = e.dataTransfer.files[0];
    if (ficheiro) handleFileSelection(ficheiro);
});

fileInput.addEventListener('change', (e) => {
    const ficheiro = e.target.files[0];
    if (ficheiro) handleFileSelection(ficheiro);
});

/**
 * Valida e regista o ficheiro selecionado pelo utilizador.
 * @param {File} file - Ficheiro escolhido.
 */
function handleFileSelection(file) {
    if (file.type !== 'application/pdf') {
        alert('Por favor, selecione apenas ficheiros PDF.');
        return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileNameDisplay.classList.add('ficheiro-selecionado'); // classe CSS, não cor inline
    processBtn.disabled = false;
}

// =============================================================================
// LÓGICA PRINCIPAL DE FRACIONAMENTO
// =============================================================================

processBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    bloquearBotao();
    mostrarOverlay();

    const { PDFDocument } = PDFLib;

    // Calcula o limite em bytes com margem de segurança
    const tamanhoMaximoMB = parseFloat(maxSizeInput.value) || 4;
    const tamanhoAlvoMB   = Math.max(0.1, tamanhoMaximoMB - MARGEM_SEGURANCA_MB);
    const limiteBytes     = tamanhoAlvoMB * 1024 * 1024;

    try {
        atualizarOverlay(`A iniciar a leitura de "${selectedFile.name}"...`);
        await delay(DELAY_LOG_MS);

        const arrayBuffer  = await selectedFile.arrayBuffer();
        const pdfOriginal  = await PDFDocument.load(arrayBuffer);
        const totalPaginas = pdfOriginal.getPageCount();
        const nomeBase     = selectedFile.name.replace(/\.[^/.]+$/, '');

        atualizarOverlay(`Ficheiro carregado. Total de páginas: ${totalPaginas}`, 'success');
        await delay(DELAY_LOG_MS);
        atualizarOverlay('A ativar algoritmo de Busca Binária para processamento ultrarrápido...', 'warning');

        const zip           = new JSZip();
        let   numeroParte   = 1;
        let   indicioInicio = 0;

        // --- Busca Binária para encontrar o corte ideal — O(log N) ---
        while (indicioInicio < totalPaginas) {
            let low         = indicioInicio;
            let high        = totalPaginas - 1;
            let melhorFim   = indicioInicio;
            let melhorBytes = null;

            atualizarOverlay(`A procurar o ponto de corte a partir da página ${indicioInicio + 1}...`);

            while (low <= high) {
                const meio    = Math.floor((low + high) / 2);
                const indices = Array.from({ length: meio - indicioInicio + 1 }, (_, i) => indicioInicio + i);

                const pdfTemp   = await PDFDocument.create();
                const paginas   = await pdfTemp.copyPages(pdfOriginal, indices);
                paginas.forEach((pag) => pdfTemp.addPage(pag));
                const bytesTemp = await pdfTemp.save();

                if (bytesTemp.byteLength <= limiteBytes) {
                    melhorFim   = meio;
                    melhorBytes = bytesTemp;
                    low         = meio + 1; // Ainda há espaço, tenta avançar
                } else {
                    high        = meio - 1; // Passou do limite, recua
                }

                await delay(DELAY_UI_MS);
            }

            // Caso extremo: uma página isolada já ultrapassa o limite
            if (!melhorBytes) {
                atualizarOverlay(
                    `Aviso: página ${indicioInicio + 1} excede ${tamanhoMaximoMB} MB. Forçando extração individual.`,
                    'warning'
                );
                const pdfTemp  = await PDFDocument.create();
                const [pagina] = await pdfTemp.copyPages(pdfOriginal, [indicioInicio]);
                pdfTemp.addPage(pagina);
                melhorBytes    = await pdfTemp.save();
                melhorFim      = indicioInicio;
            }

            const nomeFicheiro = `${nomeBase}_Parte${numeroParte}.pdf`;
            zip.file(nomeFicheiro, melhorBytes);

            atualizarOverlay(
                `[OK] ${nomeFicheiro} — Págs. ${indicioInicio + 1}–${melhorFim + 1} (${formatarMB(melhorBytes.byteLength)} MB)`,
                'success'
            );

            numeroParte++;
            indicioInicio = melhorFim + 1;
        }

        // Gera e faz download do ZIP
        atualizarOverlay('A compactar as partes num ficheiro ZIP...', 'warning');
        await delay(DELAY_LOG_MS);

        const conteudoZip = await zip.generateAsync({ type: 'blob' });
        saveAs(conteudoZip, `${nomeBase}_Fracionado.zip`);

        atualizarOverlay('Processo concluído! O download foi iniciado.', 'success');
        await delay(DELAY_CONCLUSAO_MS);

    } catch (erro) {
        console.error(erro);
        atualizarOverlay(`Ocorreu um erro: ${erro.message}`, 'error');
        await delay(DELAY_ERRO_MS);

    } finally {
        esconderOverlay();
        restaurarBotao();
    }
});
