/* ============================================================
   BEYOND CRM — js/services/AvatarService.js   v2.0
   Upload seguro de fotos de perfil — com logs detalhados.
   Beyond Bits Tecnologia © 2026
   ============================================================ */
'use strict';

class AvatarService {

  static MAX_SIZE = 2 * 1024 * 1024;
  static BUCKET = 'avatars';

  /* ── Validar arquivo ── */
  static async validar(file) {
    var erros = [];
    if (!file) return ['Nenhum arquivo selecionado.'];

    SLog.load('AVATAR validando: ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB, type: ' + file.type + ')');

    if (!file.name.toLowerCase().endsWith('.png')) {
      erros.push('Formato inválido. Apenas .PNG.');
      SLog.error('AVATAR extensão inválida: ' + file.name);
    }
    if (file.type !== 'image/png') {
      erros.push('MIME type inválido (' + file.type + ').');
      SLog.error('AVATAR MIME inválido: ' + file.type);
    }
    if (file.size > AvatarService.MAX_SIZE) {
      erros.push('Arquivo muito grande (' + (file.size/1024/1024).toFixed(1) + 'MB). Máximo: 2MB.');
      SLog.error('AVATAR tamanho excedido: ' + file.size);
    }
    if (file.size === 0) {
      erros.push('Arquivo vazio.');
      SLog.error('AVATAR arquivo vazio');
    }

    if (erros.length === 0) {
      try {
        var bytes = await AvatarService._lerBytes(file, 8);
        var sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        var hexStr = Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join(' ');
        SLog.load('AVATAR magic bytes: ' + hexStr);
        for (var i = 0; i < sig.length; i++) {
          if (bytes[i] !== sig[i]) {
            erros.push('Conteúdo não é PNG válido.');
            SLog.error('AVATAR magic bytes não correspondem a PNG');
            break;
          }
        }
        if (erros.length === 0) SLog.info('AVATAR validação OK ✓');
      } catch (e) {
        erros.push('Erro ao verificar arquivo.');
        SLog.error('AVATAR erro leitura bytes: ' + e.message);
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

  /* ── Upload ── */
  static async upload(userId, file) {
    if (!supa) { SLog.error('AVATAR: supa não inicializado'); throw new Error('Supabase não inicializado'); }
    if (!userId) { SLog.error('AVATAR: userId ausente'); throw new Error('userId ausente'); }

    var erros = await AvatarService.validar(file);
    if (erros.length > 0) throw new Error(erros.join(' '));

    var path = userId + '.png';
    SLog.load('AVATAR enviando para bucket "' + AvatarService.BUCKET + '" path: ' + path);

    var res = await supa.storage.from(AvatarService.BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/png',
    });

    if (res.error) {
      SLog.error('AVATAR upload ERRO: ' + res.error.message + ' (statusCode: ' + (res.error.statusCode || '?') + ')');
      throw new Error('Upload falhou: ' + res.error.message);
    }

    SLog.info('AVATAR upload OK ✓ path: ' + path);
    var url = AvatarService.getUrl(userId);
    SLog.info('AVATAR URL: ' + url);
    return url;
  }

  /* ── URL pública ── */
  static getUrl(userId) {
    if (!supa) return null;
    var res = supa.storage.from(AvatarService.BUCKET).getPublicUrl(userId + '.png');
    return res.data.publicUrl + '?t=' + Date.now();
  }

  /* ── Remover ── */
  static async remover(userId) {
    if (!supa) return;
    SLog.load('AVATAR removendo: ' + userId + '.png');
    var res = await supa.storage.from(AvatarService.BUCKET).remove([userId + '.png']);
    if (res.error) {
      SLog.error('AVATAR remover ERRO: ' + res.error.message);
    } else {
      SLog.info('AVATAR removido ✓');
    }
  }

  /* ── Preview no input ── */
  static previewNoInput(file, previewId) {
    var $p = $('#' + previewId);
    if (!$p.length) return;
    if (!file || file.type !== 'image/png') {
      $p.html('<i class="bi bi-person-fill" style="font-size:28px;color:#9CA3AF;"></i>');
      return;
    }
    var r = new FileReader();
    r.onload = function(e) {
      $p.html('<img src="' + e.target.result + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">');
    };
    r.readAsDataURL(file);
  }

  /* ── Carregar avatar no header ── */
  static async carregarNoHeader(userId) {
    if (!supa || !userId) return;
    SLog.load('AVATAR buscando no header para: ' + userId);
    try {
      var res = await supa.storage.from(AvatarService.BUCKET).list('', { search: userId + '.png' });
      SLog.load('AVATAR list result: ' + JSON.stringify(res.data ? res.data.length + ' arquivos' : 'null') + (res.error ? ' ERRO: ' + res.error.message : ''));
      if (res.data && res.data.length > 0) {
        var url = AvatarService.getUrl(userId);
        $('#header-avatar-img').attr('src', url).show();
        $('#header-avatar-sigla').hide();
        SLog.info('AVATAR carregado no header ✓');
      } else {
        SLog.load('AVATAR: sem foto, usando sigla');
      }
    } catch (e) {
      SLog.error('AVATAR header erro: ' + e.message);
    }
  }

  /* ── Carregar avatar na seção Performance ── */
  static async carregarNoPerformance(userId) {
    if (!supa || !userId) return;
    SLog.load('AVATAR buscando para Performance: ' + userId);
    try {
      var res = await supa.storage.from(AvatarService.BUCKET).list('', { search: userId + '.png' });
      if (res.data && res.data.length > 0) {
        var url = AvatarService.getUrl(userId);
        $('#avatar-preview').html('<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;">');
        $('#btn-remover-avatar').show();
        SLog.info('AVATAR carregado na Performance ✓');
      } else {
        var sigla = AuthService.currentProfile ? AuthService.currentProfile.sigla : '—';
        $('#avatar-preview').html('<span style="font-size:24px;font-weight:700;color:#6B7280;">' + sigla + '</span>');
      }
    } catch (e) {
      SLog.error('AVATAR Performance erro: ' + e.message);
    }
  }
}
