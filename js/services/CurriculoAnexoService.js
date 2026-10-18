/* ============================================================
   BEYOND CRM — js/services/CurriculoAnexoService.js   v1.0
   Chamado #118 — Anexo de currículo (PDF).

   Mesmo padrão do AvatarService (validação de extensão + MIME +
   magic bytes do conteúdo, upload pro Supabase Storage), com duas
   diferenças importantes:
     1) Bucket PRIVADO (currículo tem dado pessoal do candidato) —
        avatar é público. Acesso via signed URL (expira), não URL
        pública fixa.
     2) Caminho do arquivo é ALEATÓRIO (crypto.randomUUID()), não
        baseado no id do currículo — permite anexar o PDF ANTES de
        salvar o cadastro (currículo novo só ganha id/UUID depois
        que o INSERT no banco responde). O caminho resultante é
        guardado em curriculos.anexo_path pelo CurriculoModule.

   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class CurriculoAnexoService {

  /* Documento (PDF), não foto — limite bem maior que o de avatar
     (2MB), mas ainda modesto: cobre até currículo escaneado com
     várias páginas sem abrir margem pra abuso/erro de upload. */
  static MAX_SIZE = 5 * 1024 * 1024; // 5MB
  static BUCKET = 'curriculos';

  /* ── Validar arquivo ── */
  static async validar(file) {
    var erros = [];
    if (!file) return ['Nenhum arquivo selecionado.'];

    SLog.load('ANEXO CURRICULO validando: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB, type: ' + file.type + ')');

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      erros.push('Formato inválido. Apenas .PDF.');
    }
    if (file.type !== 'application/pdf') {
      erros.push('Tipo de arquivo inválido (' + file.type + ').');
    }
    if (file.size > CurriculoAnexoService.MAX_SIZE) {
      erros.push('Arquivo muito grande (' + (file.size/1024/1024).toFixed(1) + 'MB). Máximo: 5MB.');
    }
    if (file.size === 0) {
      erros.push('Arquivo vazio.');
    }

    if (erros.length === 0) {
      try {
        /* Assinatura de um PDF válido: os bytes "%PDF-" no início do
           arquivo (mesma ideia do magic-bytes do AvatarService, só
           que PDF não tem um cabeçalho binário fixo de 8 bytes — é
           o texto "%PDF-" seguido da versão, ex.: "%PDF-1.7"). Pega
           renomear um .txt pra .pdf e mandar. */
        var bytes = await CurriculoAnexoService._lerBytes(file, 5);
        var texto = String.fromCharCode.apply(null, bytes);
        if (texto !== '%PDF-') {
          erros.push('Conteúdo não é um PDF válido.');
        }
      } catch (e) {
        erros.push('Erro ao verificar arquivo.');
        SLog.error('ANEXO CURRICULO erro leitura bytes: ' + e.message);
      }
    }
    return erros;
  }

  static _lerBytes(file, n) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onload = function() { resolve(new Uint8Array(r.result)); };
      r.onerror = function() { reject(new Error('Falha ao ler')); };
      r.readAsArrayBuffer(file.slice(0, n));
    });
  }

  /* ── Upload — caminho aleatório, não upsert (cada anexo é um
     arquivo novo; o antigo é removido explicitamente por
     CurriculoModule.removerAnexo quando o usuário troca o arquivo). ── */
  static async upload(file) {
    if (!supa) { SLog.error('ANEXO CURRICULO: supa não inicializado'); throw new Error('Supabase não inicializado'); }

    var erros = await CurriculoAnexoService.validar(file);
    if (erros.length > 0) throw new Error(erros.join(' '));

    var uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2));
    var path = uuid + '.pdf';
    SLog.load('ANEXO CURRICULO enviando para bucket "' + CurriculoAnexoService.BUCKET + '" path: ' + path);

    var res = await supa.storage.from(CurriculoAnexoService.BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf',
    });

    if (res.error) {
      SLog.error('ANEXO CURRICULO upload ERRO: ' + res.error.message);
      throw new Error('Upload falhou: ' + res.error.message);
    }

    SLog.info('ANEXO CURRICULO upload OK ✓ path: ' + path);
    return { path: path, nomeOriginal: file.name, tamanho: file.size };
  }

  /* ── URL assinada (bucket privado) — expira em 1h, gerada sob
     demanda só quando o usuário clica em "Ver anexo". ── */
  static async getSignedUrl(path) {
    if (!supa || !path) return null;
    var res = await supa.storage.from(CurriculoAnexoService.BUCKET).createSignedUrl(path, 3600);
    if (res.error) {
      SLog.error('ANEXO CURRICULO signed url ERRO: ' + res.error.message);
      return null;
    }
    return res.data.signedUrl;
  }

  /* ── Remover ── */
  static async remover(path) {
    if (!supa || !path) return;
    SLog.load('ANEXO CURRICULO removendo: ' + path);
    var res = await supa.storage.from(CurriculoAnexoService.BUCKET).remove([path]);
    if (res.error) {
      SLog.error('ANEXO CURRICULO remover ERRO: ' + res.error.message);
    } else {
      SLog.info('ANEXO CURRICULO removido ✓');
    }
  }
}
