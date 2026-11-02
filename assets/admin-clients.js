<!-- Sostituisci la sezione Documents esistente con questa: -->
<section>
  <h3 class="text-cyberGreen text-xs uppercase tracking-wider font-bold mb-3">📎 Documents</h3>
  <div class="space-y-3">
    <label class="block">
      <span class="text-[10px] text-slate-500 uppercase">Fiche technique (PDF/Image)</span>
      <div class="flex gap-2 mt-1">
        <input type="file" name="fiche_file" accept=".pdf,image/*" class="ac-file flex-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:bg-kemetGold/20 file:text-kemetGold file:border-0 file:text-[10px] file:font-bold">
        ${isEdit && d.fiche_technique_url ? `<a href="${esc(d.fiche_technique_url)}" target="_blank" class="px-3 py-2 rounded border border-cyberGreen/50 text-cyberGreen text-[10px] font-bold hover:bg-cyberGreen/10 whitespace-nowrap">👁 Voir</a>` : ''}
      </div>
      <input type="hidden" name="fiche_technique_url" value="${esc(d.fiche_technique_url || '')}">
    </label>
    <label class="block">
      <span class="text-[10px] text-slate-500 uppercase">Contrat / LOI (PDF/Image)</span>
      <div class="flex gap-2 mt-1">
        <input type="file" name="contract_file" accept=".pdf,image/*" class="ac-file flex-1 px-3 py-2 bg-[#0F1419] border border-slate-700 rounded text-slate-100 text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:bg-kemetGold/20 file:text-kemetGold file:border-0 file:text-[10px] file:font-bold">
        ${isEdit && d.contract_url ? `<a href="${esc(d.contract_url)}" target="_blank" class="px-3 py-2 rounded border border-cyberGreen/50 text-cyberGreen text-[10px] font-bold hover:bg-cyberGreen/10 whitespace-nowrap">👁 Voir</a>` : ''}
      </div>
      <input type="hidden" name="contract_url" value="${esc(d.contract_url || '')}">
    </label>
  </div>
</section>
