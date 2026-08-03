const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const formFields = ["customer", "recipientPosition", "recipientName", "recipientAddress", "recipientGreetingText", "proposalDate", "proposalNumber", "replyNumber", "replyDate", "vatRate", "signatoryPosition", "signatoryName", "executorName", "executorPhone", "executorExtension", "executorEmail", "preTableText", "postTableText"];
const draftStorageKey = "commercial-proposal-builder";
const historyStorageKey = "commercial-proposal-history";
const recipientsStorageKey = "commercial-proposal-recipients";
let cloudClient = null;
let cloudUser = null;
let cloudReady = false;
const tbody = $("#itemsTable tbody");
const theadRow = $("#itemsTable thead tr");
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const company = {
  name: "ООО «АНТАВА»",
  ogrn: "1227700917212",
  inn: "9729337591",
  kpp: "772201001",
  address: "111024, г. Москва, ул. Авиамоторная, д. 8А, стр. 5, 2 этаж, помещение I, комнаты №№ 1–7, 7А, 8–20",
  phone: "+7 (495) 740-30-77",
  email: "contact@antava-trade.ru"
};

const defaultColumns = [
  { id:"requestName", label:"Наименование по заявке", type:"text", inProposal:false, role:"requestName" },
  { id:"supplyName", label:"Наименование к поставке", type:"text", inProposal:true, role:"supplyName" },
  { id:"manufacturer", label:"Производитель", type:"text", inProposal:true, role:"manufacturer" },
  { id:"comment", label:"Комментарий", type:"text", inProposal:false, role:"comment" },
  { id:"quantity", label:"Количество", type:"number", inProposal:true, role:"quantity" },
  { id:"unit", label:"Ед. изм.", type:"text", inProposal:true, role:"unit" },
  { id:"salePrice", label:"Цена за ед. без НДС, руб.", type:"number", inProposal:true, role:"salePrice", currency:true },
  { id:"saleTotal", label:"Сумма без НДС, руб.", type:"computed", inProposal:true, role:"saleTotal", currency:true },
  { id:"termWeeks", label:"Срок поставки", type:"text", inProposal:true, role:"termWeeks" }
];

let columns = defaultColumns.map(column => ({ ...column }));
let rowsData = [{ values: { quantity: 1, unit: "шт." } }];
let documentType = "proposal";

function numeric(value) {
  return Number(String(value ?? "").replace(/\s/g, "").replace(",", ".")) || 0;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function columnByRole(role) {
  return columns.find(column => column.role === role);
}

function valueByRole(row, role) {
  const column = columnByRole(role);
  return column ? row.values[column.id] : "";
}

function rowSaleTotal(row) {
  return round(numeric(valueByRole(row, "quantity")) * numeric(valueByRole(row, "salePrice")));
}

function calculatedValue(row, column) {
  if (column.role === "saleTotal") return rowSaleTotal(row);
  return "";
}

function displayValue(row, column) {
  const value = column.type === "computed" ? calculatedValue(row, column) : row.values[column.id];
  if (column.currency) return money.format(numeric(value));
  if (column.type === "number" || column.type === "computed") return number.format(numeric(value));
  return String(value ?? "");
}

function calculate() {
  const sale = round(rowsData.reduce((sum, row) => sum + rowSaleTotal(row), 0));
  const vat = round(sale * numeric($("#vatRate").value) / 100);
  return { sale, vat, grand: round(sale + vat) };
}

function updateSummary() {
  const result = calculate();
  $("#saleSubtotal").textContent = money.format(result.sale);
  $("#vatTotal").textContent = money.format(result.vat);
  $("#grandTotal").textContent = money.format(result.grand);
}

function makeInput(row, column, rowIndex) {
  if (column.type === "computed") {
    const output = document.createElement("div");
    output.className = "calculated";
    output.textContent = displayValue(row, column);
    return output;
  }

  const input = column.type === "text" ? document.createElement("textarea") : document.createElement("input");
  input.dataset.colId = column.id;
  input.dataset.rowIndex = rowIndex;
  if (column.type === "text") {
    input.rows = 2;
    input.value = row.values[column.id] ?? "";
  } else {
    input.type = "number";
    input.step = "any";
    input.value = row.values[column.id] ?? "";
  }
  input.addEventListener("input", () => {
    row.values[column.id] = input.value;
    refreshComputedCells();
    updateSummary();
  });
  return input;
}

function renderTable() {
  theadRow.innerHTML = "";
  const numberHeader = document.createElement("th");
  numberHeader.textContent = "№ п/п";
  theadRow.append(numberHeader);
  columns.forEach(column => {
    const th = document.createElement("th");
    th.textContent = column.label || "Без названия";
    theadRow.append(th);
  });
  theadRow.append(document.createElement("th"));

  tbody.innerHTML = "";
  rowsData.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    const numberCell = document.createElement("td");
    numberCell.className = "row-number";
    numberCell.textContent = rowIndex + 1;
    tr.append(numberCell);

    columns.forEach(column => {
      const td = document.createElement("td");
      td.dataset.colId = column.id;
      td.append(makeInput(row, column, rowIndex));
      tr.append(td);
    });

    const actionCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.title = "Удалить строку";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      rowsData.splice(rowIndex, 1);
      if (!rowsData.length) rowsData.push({ values: {} });
      renderTable();
      updateSummary();
    });
    actionCell.append(remove);
    tr.append(actionCell);
    tbody.append(tr);
  });
}

function refreshComputedCells() {
  rowsData.forEach((row, rowIndex) => {
    columns.filter(column => column.type === "computed").forEach(column => {
      const cell = tbody.querySelector(`tr:nth-child(${rowIndex + 1}) td[data-col-id="${column.id}"] .calculated`);
      if (cell) cell.textContent = displayValue(row, column);
    });
  });
}

function addRow(values = {}) {
  rowsData.push({ values: { ...values } });
  renderTable();
  updateSummary();
}

function renderColumnsPanel() {
  const list = $("#columnsList");
  list.innerHTML = "";
  columns.forEach((column, index) => {
    const item = document.createElement("div");
    item.className = "column-setting";

    const moves = document.createElement("div");
    moves.className = "column-move";
    const up = document.createElement("button");
    up.className = "mini-button";
    up.textContent = "←";
    up.title = "Сдвинуть влево";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveColumn(index, -1));
    const down = document.createElement("button");
    down.className = "mini-button";
    down.textContent = "→";
    down.title = "Сдвинуть вправо";
    down.disabled = index === columns.length - 1;
    down.addEventListener("click", () => moveColumn(index, 1));
    moves.append(up, down);

    const label = document.createElement("input");
    label.value = column.label;
    label.placeholder = "Название столбца";
    label.addEventListener("input", () => {
      column.label = label.value;
      renderTable();
    });

    const type = document.createElement("select");
    [["text","Текст"],["number","Число"],["computed","Расчёт"]].forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = column.type === value;
      type.append(option);
    });
    type.addEventListener("change", () => {
      column.type = type.value;
      if (type.value !== "computed") column.currency = false;
      renderTable();
      updateSummary();
    });

    const proposalLabel = document.createElement("label");
    proposalLabel.className = "proposal-toggle";
    const proposalCheckbox = document.createElement("input");
    proposalCheckbox.type = "checkbox";
    proposalCheckbox.checked = column.inProposal;
    proposalCheckbox.addEventListener("change", () => column.inProposal = proposalCheckbox.checked);
    proposalLabel.append(proposalCheckbox, "Выводить в КП");

    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.textContent = "×";
    remove.title = "Удалить столбец";
    remove.addEventListener("click", () => {
      columns.splice(index, 1);
      rowsData.forEach(row => delete row.values[column.id]);
      renderColumnsPanel();
      renderTable();
      updateSummary();
    });

    item.append(moves, label, type, proposalLabel, remove);
    list.append(item);
  });
}

function moveColumn(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= columns.length) return;
  [columns[index], columns[target]] = [columns[target], columns[index]];
  renderColumnsPanel();
  renderTable();
}

function addColumn() {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  columns.push({ id, label:"Новый столбец", type:"text", inProposal:true, role:null });
  renderColumnsPanel();
  renderTable();
}

function ensureRow(index) {
  while (rowsData.length <= index) rowsData.push({ values: {} });
  return rowsData[index];
}

function normalizePastedValue(value, column) {
  const text = String(value ?? "").trim();
  if (column.type !== "number") return text;
  const normalized = text
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/[₽рР]/g, "")
    .replace(",", ".")
    .replace(/[^0-9.+-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function flashPastedCells(cells) {
  cells.forEach(cell => cell.classList.add("paste-target"));
  setTimeout(() => cells.forEach(cell => cell.classList.remove("paste-target")), 900);
}

function pasteExcelRange(event) {
  const target = event.target.closest("[data-col-id]");
  if (!target || !tbody.contains(target)) return;
  const text = event.clipboardData?.getData("text/plain");
  if (!text || (!text.includes("\t") && !/[\r\n]/.test(text))) return;

  const startRow = Number(target.dataset.rowIndex);
  const startColumn = columns.findIndex(column => column.id === target.dataset.colId);
  if (startRow < 0 || startColumn < 0) return;
  event.preventDefault();

  const grid = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
  const changed = [];
  grid.forEach((values, rowOffset) => {
    const row = ensureRow(startRow + rowOffset);
    values.forEach((value, columnOffset) => {
      const column = columns[startColumn + columnOffset];
      if (!column || column.type === "computed") return;
      row.values[column.id] = normalizePastedValue(value, column);
      changed.push({ rowIndex:startRow + rowOffset, id:column.id });
    });
  });

  renderTable();
  updateSummary();
  const cells = changed.map(item => tbody.querySelector(`tr:nth-child(${item.rowIndex + 1}) td[data-col-id="${item.id}"]`)).filter(Boolean);
  flashPastedCells(cells);
}

function formState() {
  return Object.fromEntries(formFields.map(id => [id, $(`#${id}`).value]));
}

function proposalState() {
  return {
    documentType,
    form:formState(),
    columns:columns.map(column => ({ ...column })),
    rows:rowsData.map(row => ({ values:{ ...row.values } }))
  };
}

function readHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(historyStorageKey, JSON.stringify(history));
}

function readRecipients() {
  try {
    const recipients = JSON.parse(localStorage.getItem(recipientsStorageKey) || "[]");
    return Array.isArray(recipients) ? recipients : [];
  } catch {
    return [];
  }
}

function writeRecipients(recipients) {
  localStorage.setItem(recipientsStorageKey, JSON.stringify(recipients));
}

function recipientDatabaseKey(recipient) {
  return `${recipient?.customer || ""}|${recipient?.name || ""}`.trim().toLocaleLowerCase("ru-RU");
}

function cloudDocumentToHistory(row) {
  return {
    id:row.id,
    savedAt:row.created_at,
    number:row.document_number,
    proposalDate:row.document_date,
    customer:row.customer,
    executorName:row.executor_name,
    documentType:row.document_type,
    grandTotal:numeric(row.grand_total),
    itemCount:Number(row.item_count) || 0,
    state:row.document_state
  };
}

function cloudRecipientToLocal(row) {
  return {
    id:row.id,
    customer:row.customer,
    position:row.position,
    name:row.recipient_name,
    address:row.address,
    updatedAt:row.updated_at
  };
}

async function loadCloudData() {
  if (!cloudReady) return;
  const [documentsResult, recipientsResult] = await Promise.all([
    cloudClient.from("documents").select("*").order("created_at", { ascending:false }).limit(100),
    cloudClient.from("recipients").select("*").order("updated_at", { ascending:false }).limit(200)
  ]);
  if (documentsResult.error) throw documentsResult.error;
  if (recipientsResult.error) throw recipientsResult.error;
  writeHistory(documentsResult.data.map(cloudDocumentToHistory));
  writeRecipients(recipientsResult.data.map(cloudRecipientToLocal));
  renderHistory();
  renderRecipientDatabase();
}

async function saveDocumentToCloud(record) {
  if (!cloudReady) return record;
  const { data, error } = await cloudClient.from("documents").insert({
    document_type:record.documentType,
    document_number:record.number,
    document_date:record.proposalDate || null,
    customer:record.customer,
    executor_name:record.executorName,
    grand_total:record.grandTotal,
    item_count:record.itemCount,
    document_state:record.state,
    created_by:cloudUser.id
  }).select("*").single();
  if (error) throw error;
  return cloudDocumentToHistory(data);
}

async function deleteDocumentFromCloud(id) {
  if (!cloudReady || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  const { error } = await cloudClient.from("documents").delete().eq("id", id);
  if (error) throw error;
}

async function migrateLocalCacheToCloud() {
  const migrationKey = `cloud-migration-${window.APP_SUPABASE_CONFIG?.url || "default"}`;
  if (!cloudReady || localStorage.getItem(migrationKey)) return;
  const localHistory = readHistory();
  const localRecipients = readRecipients();
  const { count:documentCount, error:countError } = await cloudClient
    .from("documents").select("*", { count:"exact", head:true });
  if (countError) throw countError;
  if (documentCount === 0 && localHistory.length) {
    const payload = localHistory.map(record => ({
      document_type:record.documentType === "letter" || record.state?.documentType === "letter" ? "letter" : "proposal",
      document_number:record.number || "",
      document_date:record.proposalDate || null,
      customer:record.customer || "",
      executor_name:record.executorName || record.state?.form?.executorName || "",
      grand_total:numeric(record.grandTotal),
      item_count:Number(record.itemCount) || 0,
      document_state:record.state || {},
      created_by:cloudUser.id,
      created_at:record.savedAt || new Date().toISOString()
    }));
    const { error } = await cloudClient.from("documents").insert(payload);
    if (error) throw error;
  }
  if (localRecipients.length) {
    const uniqueRecipients = new Map();
    localRecipients.forEach(recipient => {
      const normalizedKey = `${recipient.customer || ""}|${recipient.name || ""}`.toLocaleLowerCase("ru-RU");
      if (!normalizedKey.replace("|", "").trim()) return;
      uniqueRecipients.set(normalizedKey, {
        customer:recipient.customer || "",
        position:recipient.position || "",
        recipient_name:recipient.name || "",
        address:recipient.address || "",
        normalized_key:normalizedKey,
        created_by:cloudUser.id,
        updated_at:recipient.updatedAt || new Date().toISOString()
      });
    });
    if (uniqueRecipients.size) {
      const { error } = await cloudClient.from("recipients")
        .upsert([...uniqueRecipients.values()], { onConflict:"normalized_key" });
      if (error) throw error;
    }
  }
  localStorage.setItem(migrationKey, new Date().toISOString());
}

function migrateRecipientsFromHistory() {
  if (readRecipients().length) return;
  const seen = new Set();
  const recipients = [];
  readHistory().forEach(record => {
    const form = record.state?.form;
    const customer = String(form?.customer || "").trim();
    const name = String(form?.recipientName || "").trim();
    if (!customer && !name) return;
    const key = `${customer}|${name}`.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({
      id:`recipient_${record.id || Math.random().toString(36).slice(2, 9)}`,
      customer,
      position:String(form?.recipientPosition || "").trim(),
      name,
      address:String(form?.recipientAddress || "").trim(),
      updatedAt:record.savedAt || new Date().toISOString()
    });
  });
  if (recipients.length) writeRecipients(recipients.slice(0, 200));
}

async function saveRecipientToDatabase() {
  const customer = $("#customer").value.trim();
  const name = $("#recipientName").value.trim();
  if (!customer && !name) return;
  const recipients = readRecipients();
  const normalizedCustomer = customer.toLocaleLowerCase("ru-RU");
  const normalizedName = name.toLocaleLowerCase("ru-RU");
  const existingIndex = recipients.findIndex(recipient =>
    String(recipient.customer || "").toLocaleLowerCase("ru-RU") === normalizedCustomer &&
    String(recipient.name || "").toLocaleLowerCase("ru-RU") === normalizedName
  );
  const existing = existingIndex >= 0 ? recipients[existingIndex] : null;
  const recipient = {
    id:existing?.id || `recipient_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    customer,
    position:$("#recipientPosition").value.trim(),
    name,
    address:$("#recipientAddress").value.trim(),
    updatedAt:new Date().toISOString()
  };
  if (existingIndex >= 0) recipients.splice(existingIndex, 1);
  recipients.unshift(recipient);
  writeRecipients(recipients.slice(0, 200));
  renderRecipientDatabase();
  if (cloudReady) {
    const normalizedKey = `${normalizedCustomer}|${normalizedName}`;
    const { data, error } = await cloudClient.from("recipients").upsert({
      customer,
      position:recipient.position,
      recipient_name:name,
      address:recipient.address,
      normalized_key:normalizedKey,
      created_by:cloudUser.id,
      updated_at:new Date().toISOString()
    }, { onConflict:"normalized_key" }).select("*").single();
    if (error) throw error;
    const cloudRecipient = cloudRecipientToLocal(data);
    const updatedRecipients = readRecipients().filter(item =>
      `${item.customer || ""}|${item.name || ""}`.toLocaleLowerCase("ru-RU") !== normalizedKey
    );
    updatedRecipients.unshift(cloudRecipient);
    writeRecipients(updatedRecipients.slice(0, 200));
    renderRecipientDatabase();
  }
}

function renderRecipientDatabase() {
  const select = $("#recipientDatabaseSelect");
  if (!select) return;
  const selected = select.value;
  const recipients = readRecipients();
  select.innerHTML = '<option value="">Новый получатель</option>';
  recipients.forEach(recipient => {
    const option = document.createElement("option");
    option.value = recipientDatabaseKey(recipient);
    option.textContent = [recipient.customer, recipient.name].filter(Boolean).join(" — ") || "Без названия";
    select.append(option);
  });
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
  $("#deleteRecipientButton").disabled = !select.value;
}

function fillRecipientFromDatabase() {
  $("#deleteRecipientButton").disabled = !$("#recipientDatabaseSelect").value;
  $("#recipientDatabaseMessage").textContent = "";
  const selectedKey = $("#recipientDatabaseSelect").value;
  const recipient = readRecipients().find(item => recipientDatabaseKey(item) === selectedKey);
  if (!recipient) return;
  $("#customer").value = recipient.customer || "";
  $("#recipientPosition").value = recipient.position || "";
  $("#recipientName").value = recipient.name || "";
  $("#recipientAddress").value = recipient.address || "";
  updateGreetingPlaceholder();
}

async function deleteSelectedRecipient() {
  const select = $("#recipientDatabaseSelect");
  const recipients = readRecipients();
  let recipient = recipients.find(item => recipientDatabaseKey(item) === select.value);
  if (!recipient) {
    const customer = $("#customer").value.trim().toLocaleLowerCase("ru-RU");
    const name = $("#recipientName").value.trim().toLocaleLowerCase("ru-RU");
    recipient = recipients.find(item =>
      String(item.customer || "").trim().toLocaleLowerCase("ru-RU") === customer &&
      String(item.name || "").trim().toLocaleLowerCase("ru-RU") === name
    );
  }
  if (!recipient) {
    $("#recipientDatabaseMessage").textContent = "Сначала выберите получателя из выпадающего списка.";
    return;
  }
  await deleteRecipientRecord(recipient, $("#deleteRecipientButton"));
}

async function deleteRecipientRecord(recipient, button) {
  const title = [recipient.customer, recipient.name].filter(Boolean).join(" — ") || "получателя";
  if (!window.confirm(`Удалить ${title} из общей базы получателей?`)) return;
  button.disabled = true;
  const message = $("#recipientDatabaseMessage");
  message.textContent = "Удаляем получателя из общей базы…";
  try {
    if (cloudReady) {
      let query = cloudClient.from("recipients").delete();
      if (/^[0-9a-f-]{36}$/i.test(String(recipient.id))) {
        query = query.eq("id", recipient.id);
      } else {
        const normalizedKey = `${recipient.customer || ""}|${recipient.name || ""}`.toLocaleLowerCase("ru-RU");
        query = query.eq("normalized_key", normalizedKey);
      }
      const { data, error } = await query.select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("База не подтвердила удаление получателя.");
    }
    const deletedKey = recipientDatabaseKey(recipient);
    writeRecipients(readRecipients().filter(item => recipientDatabaseKey(item) !== deletedKey));
    select.value = "";
    $("#customer").value = "";
    $("#recipientPosition").value = "";
    $("#recipientName").value = "";
    $("#recipientAddress").value = "";
    $("#recipientGreetingText").value = "";
    updateGreetingPlaceholder();
    updateSummary();
    if (cloudReady) await loadCloudData();
    renderRecipientDatabase();
    message.textContent = `Получатель «${title}» удалён из общей базы.`;
  } catch (error) {
    console.error(error);
    button.disabled = false;
    message.textContent = `Не удалось удалить получателя: ${error.message || "неизвестная ошибка"}`;
  }
}

async function addHistoryRecord() {
  const state = proposalState();
  const activeRows = rowsData.filter(row => columns.some(column => String(row.values[column.id] ?? "").trim()));
  const history = readHistory();
  let record = {
    id:`kp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt:new Date().toISOString(),
    number:$("#proposalNumber").value.trim() || "Без номера",
    proposalDate:$("#proposalDate").value,
    customer:$("#customer").value.trim() || "Заказчик не указан",
    executorName:$("#executorName").value.trim(),
    documentType,
    grandTotal:documentType === "proposal" ? calculate().grand : 0,
    itemCount:documentType === "proposal" ? activeRows.length : 0,
    state
  };
  record = await saveDocumentToCloud(record);
  history.unshift(record);
  writeHistory(history.slice(0, 100));
  renderHistory();
}

async function save() {
  const button = $("#saveButton");
  button.disabled = true;
  button.textContent = "Сохраняем…";
  localStorage.setItem(draftStorageKey, JSON.stringify(proposalState()));
  try {
    await saveRecipientToDatabase();
    await addHistoryRecord();
    button.textContent = "Сохранено ✓";
  } catch (error) {
    console.error(error);
    button.textContent = "Ошибка сохранения";
  } finally {
    setTimeout(() => {
      button.textContent = "Сохранить в историю";
      button.disabled = false;
    }, 1600);
  }
}

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function applyDocumentTypeUI() {
  const isLetter = documentType === "letter";
  $("#commercialConditionsSection").hidden = isLetter;
  $("#nomenclatureSection").hidden = isLetter;
  $("#summarySection").hidden = isLetter;
  $("#postTableField").hidden = isLetter;
  $("#freeTextDescription").textContent = isLetter
    ? "Основной текст письма"
    : "Дополнительная информация до и после таблицы с позициями";
  $("#preTableLabel").textContent = isLetter ? "Текст письма" : "Текст перед таблицей";
  $("#detailsTitle").textContent = isLetter ? "Данные письма" : "Данные коммерческого предложения";
  $("#documentDateLabel").textContent = isLetter ? "Дата письма" : "Дата КП";
  $("#excelButton").hidden = isLetter;
  $("#proposalExcelButton").hidden = isLetter;
  $("#proposal .proposal-toolbar h2").textContent = isLetter ? "Письмо" : "Коммерческое предложение";
  $$(".details-section").filter(section => !section.hidden).forEach((section, index) => {
    const numberBadge = $(".details-section-number", section);
    if (numberBadge) numberBadge.textContent = index + 1;
  });
}

function resetDocument(type) {
  const isLetter = type === "letter";
  if (!window.confirm(`Очистить текущие данные и создать ${isLetter ? "новое письмо" : "новое коммерческое предложение"}?`)) return;
  documentType = isLetter ? "letter" : "proposal";
  const defaults = {
    customer:"",
    recipientPosition:"",
    recipientName:"",
    recipientAddress:"",
    recipientGreetingText:"",
    proposalDate:todayInputValue(),
    proposalNumber:isLetter ? "ИСХ-001" : "КП-001",
    replyNumber:"",
    replyDate:"",
    vatRate:"22",
    signatoryPosition:"Генеральный директор",
    signatoryName:"Батурина Татьяна Алексеевна",
    executorName:"",
    executorPhone:"8 (495) 740-30-77",
    executorExtension:"",
    executorEmail:"contact@antava-trade.ru",
    preTableText:"",
    postTableText:""
  };
  formFields.forEach(id => {
    $(`#${id}`).value = defaults[id] ?? "";
  });
  columns = defaultColumns.map(column => ({ ...column }));
  rowsData = [{ values:{ quantity:1, unit:"шт." } }];
  localStorage.removeItem(draftStorageKey);
  syncEditorsFromState();
  renderColumnsPanel();
  renderTable();
  updateSummary();
  $("#proposalDocument").innerHTML = "";
  $("#exportHint").textContent = "";
  $("#recipientDatabaseSelect").value = "";
  $("#deleteRecipientButton").disabled = true;
  updateGreetingPlaceholder();
  applyDocumentTypeUI();
  showTab("calculation");
}

function newProposal() {
  resetDocument("proposal");
}

function newLetter() {
  resetDocument("letter");
}

function load() {
  const saved = JSON.parse(localStorage.getItem(draftStorageKey) || "null");
  if (!saved) return false;
  documentType = saved.documentType === "letter" ? "letter" : "proposal";
  formFields.forEach(id => { if (saved.form?.[id] != null) $(`#${id}`).value = saved.form[id]; });
  if (Array.isArray(saved.columns) && saved.columns.length) columns = saved.columns;
  const savedTermColumn = columns.find(column => column.role === "termWeeks");
  if (savedTermColumn) {
    savedTermColumn.type = "text";
    savedTermColumn.label = savedTermColumn.label === "Срок поставки, нед." ? "Срок поставки" : savedTermColumn.label;
  }
  const savedSupplyColumn = columns.find(column => column.role === "supplyName");
  if (savedSupplyColumn?.label === "Предлагаемое наименование") {
    savedSupplyColumn.label = "Наименование к поставке";
  }
  if (Array.isArray(saved.rows)) rowsData = saved.rows;
  else if (Array.isArray(saved.items)) rowsData = saved.items.map(item => ({ values:{ ...item } }));
  if (!rowsData.length) rowsData = [{ values:{} }];
  return true;
}

function restoreProposal(record) {
  const saved = record?.state;
  if (!saved) return;
  documentType = saved.documentType === "letter" || record.documentType === "letter" ? "letter" : "proposal";
  formFields.forEach(id => {
    if (saved.form?.[id] != null) $(`#${id}`).value = saved.form[id];
  });
  if (Array.isArray(saved.columns) && saved.columns.length) {
    columns = saved.columns.map(column => ({ ...column }));
  }
  if (Array.isArray(saved.rows) && saved.rows.length) {
    rowsData = saved.rows.map(row => ({ values:{ ...row.values } }));
  } else {
    rowsData = [{ values:{} }];
  }
  localStorage.setItem(draftStorageKey, JSON.stringify(proposalState()));
  renderColumnsPanel();
  renderTable();
  updateSummary();
  syncEditorsFromState();
  updateExecutorExtension();
  updateGreetingPlaceholder();
  applyDocumentTypeUI();
  showTab("calculation");
}

function renderHistory() {
  const body = $("#historyTableBody");
  const empty = $("#historyEmpty");
  if (!body || !empty) return;
  const history = readHistory();
  body.innerHTML = "";
  empty.hidden = history.length > 0;
  history.forEach(record => {
    const row = document.createElement("tr");
    const isLetter = record.documentType === "letter" || record.state?.documentType === "letter";
    const savedAt = new Date(record.savedAt);
    const savedText = Number.isNaN(savedAt.getTime())
      ? "—"
      : new Intl.DateTimeFormat("ru-RU", { dateStyle:"short", timeStyle:"short" }).format(savedAt);
    [
      savedText,
      isLetter ? "Письмо" : "КП",
      record.number || "Без номера",
      record.proposalDate ? formatDocumentDate(record.proposalDate) : "—",
      record.customer || "Заказчик не указан",
      record.executorName || record.state?.form?.executorName || "Не выбран",
      isLetter ? "—" : money.format(numeric(record.grandTotal)),
      isLetter ? "—" : String(record.itemCount ?? 0)
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    const actions = document.createElement("td");
    actions.className = "history-actions";
    const restore = document.createElement("button");
    restore.className = "button button-secondary history-action-button";
    restore.textContent = "Открыть";
    restore.addEventListener("click", () => restoreProposal(record));
    const openPdf = document.createElement("button");
    openPdf.className = "button button-primary history-action-button";
    openPdf.textContent = "PDF";
    openPdf.title = "Посмотреть документ в PDF";
    openPdf.addEventListener("click", () => openHistoryPdf(record, openPdf));
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.title = "Удалить из истории";
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await deleteDocumentFromCloud(record.id);
        writeHistory(readHistory().filter(item => item.id !== record.id));
        renderHistory();
      } catch (error) {
        console.error(error);
        remove.disabled = false;
      }
    });
    actions.append(restore, openPdf, remove);
    row.append(actions);
    body.append(row);
  });
}

async function openHistoryPdf(record, button) {
  const pdfWindow = window.open("", "_blank");
  button.disabled = true;
  try {
    restoreProposal(record);
    generateProposal();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const blob = await proposalPdfBlob();
    const url = URL.createObjectURL(blob);
    if (pdfWindow) {
      pdfWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      URL.revokeObjectURL(url);
      alert("Браузер заблокировал открытие PDF. Разрешите всплывающие окна для этого сайта.");
    }
  } catch (error) {
    if (pdfWindow) pdfWindow.close();
    console.error(error);
    alert("Не удалось сформировать PDF. Обновите страницу и повторите.");
  } finally {
    button.disabled = false;
  }
}

function showTab(name) {
  $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === name));
}

function safe(text) {
  return String(text ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
}

function xmlSafe(text) {
  return String(text ?? "").replace(/[&<>"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}

function safeFileName(value) {
  return String(value || "КП")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "КП";
}

function excelCell(value, type = "String", style = "") {
  const styleAttribute = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${styleAttribute}><Data ss:Type="${type}">${xmlSafe(value)}</Data></Cell>`;
}

function exportToExcel() {
  const proposalColumns = columns.filter(column => column.inProposal);
  const exportColumns = proposalColumns.length ? proposalColumns : columns;
  const activeRows = rowsData.filter(row => columns.some(column => String(row.values[column.id] ?? "").trim()));
  const { sale, vat, grand } = calculate();
  const headings = ["№", ...exportColumns.map(column => column.label)];
  const tableRows = activeRows.map((row, index) => {
    const cells = [excelCell(index + 1, "Number", "Body")];
    exportColumns.forEach(column => {
      const raw = column.type === "computed" ? calculatedValue(row, column) : row.values[column.id];
      const isNumeric = column.type === "number" || column.type === "computed";
      cells.push(excelCell(isNumeric ? numeric(raw) : raw, isNumeric ? "Number" : "String", column.currency ? "Money" : "Body"));
    });
    return `<Row>${cells.join("")}</Row>`;
  }).join("");
  const vatRate = numeric($("#vatRate").value);
  const metadata = [
    ["Организация получателя", $("#customer").value],
    ["Получатель", [$("#recipientPosition").value, $("#recipientName").value].filter(Boolean).join(", ")],
    ["Адрес", $("#recipientAddress").value],
    ["Номер КП", $("#proposalNumber").value],
    ["Дата КП", formatDocumentDate($("#proposalDate").value)]
  ].map(([label, value]) => `<Row>${excelCell(label, "String", "Label")}${excelCell(value, "String", "Body")}</Row>`).join("");
  const totals = [
    ["Итого без НДС", sale],
    [`НДС ${number.format(vatRate)}%`, vat],
    ["Итого с НДС", grand]
  ].map(([label, value]) => `<Row>${excelCell(label, "String", "Label")}${excelCell(value, "Number", "Money")}</Row>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#166534" ss:Pattern="Solid"/><Alignment ss:WrapText="1" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Label"><Font ss:Bold="1"/><Interior ss:Color="#E8F5EC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Body"><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00 &quot;₽&quot;"/><Alignment ss:Horizontal="Right"/></Style>
 </Styles>
 <Worksheet ss:Name="Коммерческое предложение">
  <Table>
   <Column ss:Width="45"/><Column ss:Width="190"/>
   <Row ss:Height="26">${excelCell("Коммерческое предложение", "String", "Title")}</Row>
   ${metadata}
   <Row/>
   <Row>${headings.map(heading => excelCell(heading, "String", "Header")).join("")}</Row>
   ${tableRows}
   <Row/>
   ${totals}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>7</SplitHorizontal><TopRowBottomPane>7</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
 </Worksheet>
</Workbook>`;
  const blob = new Blob(["\uFEFF", workbook], { type:"application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName($("#proposalNumber").value)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pdfDocumentDefinition() {
  const proposalColumns = columns.filter(column => column.inProposal);
  const activeRows = rowsData.filter(row => columns.some(column => String(row.values[column.id] ?? "").trim()));
  const { sale, vat, grand } = calculate();
  const landscape = documentType === "proposal" && proposalColumns.length > 7;
  const recipient = [
    $("#recipientPosition").value,
    $("#customer").value,
    $("#recipientName").value,
    $("#recipientAddress").value
  ].filter(value => String(value).trim()).join("\n");
  const tableBody = [
    [
      { text:"№", style:"tableHeader" },
      ...proposalColumns.map(column => ({ text:column.label || "Без названия", style:"tableHeader" }))
    ],
    ...activeRows.map((row, index) => [
      { text:String(index + 1), alignment:"center" },
      ...proposalColumns.map(column => ({
        text:displayValue(row, column),
        alignment:column.type === "number" || column.type === "computed" ? "right" : "left"
      }))
    ])
  ];
  const replyLine = $("#replyNumber").value.trim()
    ? `На № ${$("#replyNumber").value.trim()}${$("#replyDate").value ? ` от ${formatDocumentDate($("#replyDate").value)}` : ""}`
    : "";
  const content = [
    {
      columns:[
        { width:"55%", stack:[
          { text:"АНТАВА", color:"#166534", bold:true, fontSize:25, margin:[0,0,0,5] },
          { text:company.name, bold:true, fontSize:11 }
        ] },
        { width:"45%", text:[
          `ОГРН: ${company.ogrn}\n`,
          `ИНН/КПП: ${company.inn} / ${company.kpp}\n`,
          `${company.address}\n`,
          `Тел.: ${company.phone}\nE-mail: ${company.email}`
        ], alignment:"right", fontSize:8, color:"#3c413e" }
      ],
      margin:[0,0,0,22]
    },
    {
      columns:[
        { width:"50%", text:`${formatDocumentDate($("#proposalDate").value)} № ${$("#proposalNumber").value}${replyLine ? `\n${replyLine}` : ""}`, fontSize:10 },
        { width:"50%", text:recipient, fontSize:10 }
      ],
      margin:[0,0,0,24]
    },
    ...(recipientGreeting() ? [{
      text:recipientGreeting(),
      bold:true,
      alignment:"center",
      margin:[0,0,0,14]
    }] : [])
  ];
  if (proposalColumns.length && activeRows.length) {
    content.push({
      table:{
        headerRows:1,
        widths:["auto", ...proposalColumns.map(() => "*")],
        body:tableBody
      },
      layout:{
        fillColor:rowIndex => rowIndex === 0 ? "#5d6470" : null,
        hLineColor:"#d7dbe0",
        vLineColor:"#d7dbe0"
      },
      fontSize:landscape ? 7 : 7.5,
      margin:[0,0,0,18]
    });
  } else {
    content.push({ text:"Добавьте позиции и выберите столбцы для вывода в КП.", color:"#65736b", margin:[0,15,0,25] });
  }
  content.push(
    {
      table:{
        widths:["*", 110],
        body:[
          ["Итого без НДС:", { text:money.format(sale), alignment:"right", bold:true }],
          [`НДС ${number.format(numeric($("#vatRate").value))}%:`, { text:money.format(vat), alignment:"right", bold:true }],
          [{ text:"Итого с НДС:", bold:true }, { text:money.format(grand), alignment:"right", bold:true }]
        ]
      },
      layout:"lightHorizontalLines",
      margin:[landscape ? 430 : 250,0,0,35]
    },
    {
      columns:[
        { width:"40%", text:$("#signatoryPosition").value || "Генеральный директор", bold:true },
        { width:"20%", text:"________________", alignment:"center", margin:[0,12,0,0] },
        { width:"40%", text:$("#signatoryName").value || "Батурина Татьяна Алексеевна", bold:true, alignment:"right", margin:[0,12,0,0] }
      ]
    }
  );
  return {
    pageSize:"A4",
    pageOrientation:landscape ? "landscape" : "portrait",
    pageMargins:[34,32,34,32],
    defaultStyle:{ font:"Roboto", fontSize:9, lineHeight:1.25 },
    styles:{
      title:{ fontSize:16, bold:true, alignment:"center", margin:[0,0,0,16] },
      tableHeader:{ color:"#ffffff", bold:true, fontSize:7, alignment:"center" }
    },
    content
  };
}

async function proposalPdfBlob() {
  generateProposal();
  if (!window.pdfMake || !window.html2canvas) throw new Error("PDF modules are unavailable");
  const documentElement = $("#proposalDocument");
  if (document.fonts?.ready) await document.fonts.ready;
  const images = $$("img", documentElement);
  await Promise.all(images.map(image => image.complete
    ? Promise.resolve()
    : new Promise(resolve => {
        image.addEventListener("load", resolve, { once:true });
        image.addEventListener("error", resolve, { once:true });
      })
  ));
  const canvas = await window.html2canvas(documentElement, {
    scale:4,
    backgroundColor:"#ffffff",
    useCORS:true,
    imageTimeout:15000,
    logging:false,
    onclone:clonedDocument => {
      const clone = clonedDocument.querySelector("#proposalDocument");
      if (clone) {
        clone.style.boxShadow = "none";
        clone.style.margin = "0";
      }
    }
  });
  const landscape = documentElement.classList.contains("proposal-document-landscape");
  const pageWidth = landscape ? 841.89 : 595.28;
  const pageHeight = landscape ? 595.28 : 841.89;
  const sliceHeight = Math.max(1, Math.floor(canvas.width * pageHeight / pageWidth));
  const pages = [];
  const heightOverflow = canvas.height / sliceHeight;
  if (heightOverflow <= 1.02) {
    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const fittedWidth = canvas.width * scale;
    const fittedHeight = canvas.height * scale;
    pages.push({
      image:canvas.toDataURL("image/png"),
      width:fittedWidth,
      height:fittedHeight,
      margin:[(pageWidth - fittedWidth) / 2, (pageHeight - fittedHeight) / 2, 0, 0]
    });
  } else {
    for (let top = 0; top < canvas.height; top += sliceHeight) {
      const partHeight = Math.min(sliceHeight, canvas.height - top);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, top, canvas.width, partHeight, 0, 0, canvas.width, partHeight);
      pages.push({
        image:pageCanvas.toDataURL("image/png"),
        width:pageWidth,
        height:pageHeight,
        margin:[0,0,0,0]
      });
    }
  }
  const definition = {
    pageSize:"A4",
    pageOrientation:landscape ? "landscape" : "portrait",
    pageMargins:[0,0,0,0],
    content:pages.map((page, index) => ({
      ...page,
      pageBreak:index < pages.length - 1 ? "after" : undefined
    }))
  };
  return new Promise((resolve, reject) => {
    try {
      window.pdfMake.createPdf(definition).getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

async function prepareProposalForOutput() {
  const hint = $("#exportHint");
  const printWindow = window.open("", "_blank");
  try {
    hint.textContent = "Формируем точную копию КП для печати…";
    const blob = await proposalPdfBlob();
    const url = URL.createObjectURL(blob);
    if (printWindow) {
      printWindow.location.href = url;
      hint.textContent = "КП открыто в новой вкладке. Нажмите значок принтера.";
    } else {
      hint.textContent = "Браузер заблокировал новую вкладку. Разрешите всплывающие окна и повторите.";
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    if (printWindow) printWindow.close();
    hint.textContent = "Не удалось подготовить печать. Обновите страницу и повторите.";
    console.error(error);
  }
}

async function saveAsPdf() {
  const hint = $("#exportHint");
  try {
    hint.textContent = "Формируем точную копию КП в PDF…";
    const blob = await proposalPdfBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName($("#proposalNumber").value)}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    hint.textContent = "PDF с внешним видом КП отправлен в загрузки.";
  } catch (error) {
    hint.textContent = "Не удалось сохранить PDF. Обновите страницу и повторите.";
    console.error(error);
  }
}

function formatDocumentDate(value) {
  if (!value) return new Intl.DateTimeFormat("ru-RU").format(new Date());
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function nominativeRecipientWord(word, isPatronymic = false) {
  if (!word) return "";
  if (isPatronymic) {
    if (/овичу$/i.test(word) || /евичу$/i.test(word) || /ичу$/i.test(word)) return word.slice(0, -1);
    if (/овне$/i.test(word) || /евне$/i.test(word) || /ичне$/i.test(word)) return `${word.slice(0, -1)}а`;
  }
  if (/ию$/i.test(word)) return `${word.slice(0, -2)}ия`;
  if (/ею$/i.test(word)) return `${word.slice(0, -2)}ей`;
  if (/е$/i.test(word)) return `${word.slice(0, -1)}а`;
  if (/аю$/i.test(word) || /яю$/i.test(word)) return word.slice(0, -1);
  if (/у$/i.test(word)) return word.slice(0, -1);
  return word;
}

function recipientGreeting() {
  const customGreeting = $("#recipientGreetingText").value.trim();
  if (customGreeting) return customGreeting;
  const parts = $("#recipientName").value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const name = nominativeRecipientWord(parts.length >= 3 ? parts[1] : parts[0]);
  const patronymic = nominativeRecipientWord(parts.length >= 3 ? parts[2] : parts[1], true);
  const female = /(?:овна|евна|ична)$/i.test(patronymic);
  return `${female ? "Уважаемая" : "Уважаемый"} ${[name, patronymic].filter(Boolean).join(" ")}!`;
}

function updateGreetingPlaceholder() {
  const field = $("#recipientGreetingText");
  const automaticGreeting = recipientGreeting();
  field.placeholder = automaticGreeting || "Введите обращение, например: Уважаемый Иван Иванович!";
}

function executorContactHtml() {
  const name = $("#executorName").value.trim();
  const phone = $("#executorPhone").value.trim();
  const extension = $("#executorExtension").value.trim();
  const email = $("#executorEmail").value.trim();
  const lines = [];
  if (name) lines.push(`<b>Исполнитель:</b> ${safe(name)}`);
  if (phone) lines.push(`Тел.: ${safe(phone)}${extension ? `, доб. ${safe(extension)}` : ""}`);
  if (email) lines.push(`E-mail: ${safe(email)}`);
  return lines.map(line => `<span>${line}</span>`).join("");
}

function plainTextParagraphs(value) {
  return String(value || "").trim().split(/\r?\n/).map(line => line.trim()
    ? `<p>${safe(line.trim())}</p>`
    : `<p class="free-text-spacer" aria-hidden="true">&nbsp;</p>`).join("");
}

function richTextHtml(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (!/<[a-z][\s\S]*>/i.test(source)) return plainTextParagraphs(source);
  const template = document.createElement("template");
  template.innerHTML = source;
  template.content.querySelectorAll("script,style,iframe,object,embed").forEach(element => element.remove());
  const allowed = new Set(["P","DIV","BR","B","STRONG","I","EM","U","UL","OL","LI"]);
  [...template.content.querySelectorAll("*")].forEach(element => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const alignment = element.style.textAlign;
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    if (["left","center","right","justify"].includes(alignment)) element.style.textAlign = alignment;
  });
  [...template.content.childNodes].forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
    const paragraph = document.createElement("p");
    paragraph.textContent = node.textContent.trim();
    node.replaceWith(paragraph);
  });
  return template.innerHTML;
}

function syncEditorsFromState() {
  [["preTableText","preTableEditor"],["postTableText","postTableEditor"]].forEach(([storageId, editorId]) => {
    const storage = $(`#${storageId}`);
    const editor = $(`#${editorId}`);
    editor.innerHTML = richTextHtml(storage.value);
    storage.value = editor.innerHTML;
  });
}

function syncRichEditor(editor) {
  const storage = $(`#${editor.id === "preTableEditor" ? "preTableText" : "postTableText"}`);
  storage.value = richTextHtml(editor.innerHTML);
}

function updateExecutorExtension() {
  const extensions = {
    "Тинин Виктор Сергеевич":"703",
    "Хатух Тимур Бибарсович":"704",
    "Самойлова Полина Вадимовна":"702"
  };
  $("#executorExtension").value = extensions[$("#executorName").value] || "";
}

function proposalColumnWeight(column) {
  const roleWeights = {
    supplyName: 2.7,
    requestName: 2.7,
    manufacturer: 1.5,
    comment: 2.2,
    quantity: 1.15,
    unit: 0.8,
    salePrice: 1.75,
    saleTotal: 1.75,
    termWeeks: 1.4
  };
  return roleWeights[column.role] || (column.type === "text" ? 1.7 : 1.15);
}

function proposalCellClass(column) {
  if (column.role === "quantity" || column.role === "unit" || column.role === "termWeeks") return "center";
  if (column.type === "number" || column.type === "computed") return "num";
  return "";
}

function proposalColgroup(proposalColumns) {
  const weights = [0.45, ...proposalColumns.map(proposalColumnWeight)];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return `<colgroup>${weights.map(weight => `<col style="width:${(weight / total * 100).toFixed(3)}%">`).join("")}</colgroup>`;
}

function applyProposalPageLayout(landscape) {
  $("#proposalDocument").classList.toggle("proposal-document-landscape", landscape);
  let pageStyle = $("#proposalPageStyle");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "proposalPageStyle";
    document.head.append(pageStyle);
  }
  pageStyle.textContent = landscape
    ? "@media print { @page { size: A4 landscape; margin: 0; } }"
    : "@media print { @page { size: A4 portrait; margin: 0; } }";
}

function generateProposal() {
  const { sale, vat, grand } = calculate();
  const proposalDate = formatDocumentDate($("#proposalDate").value);
  const replyDate = $("#replyDate").value ? formatDocumentDate($("#replyDate").value) : "";
  const replyNumber = $("#replyNumber").value.trim();
  const replyLine = replyNumber
    ? `<div>На № ${safe(replyNumber)}${replyDate ? ` от ${replyDate}` : ""}</div>`
    : "";
  const recipientLines = [
    $("#recipientPosition").value,
    $("#customer").value,
    $("#recipientName").value,
    $("#recipientAddress").value
  ].filter(value => String(value).trim());
  const proposalColumns = columns.filter(column => column.inProposal);
  const activeRows = rowsData.filter(row => columns.some(column => String(row.values[column.id] ?? "").trim()));
  const landscape = proposalColumns.length > 7;
  applyProposalPageLayout(landscape);
  const compact = proposalColumns.length > (landscape ? 11 : 8);

  $("#proposalDocument").innerHTML = `
    <div class="proposal-top">
      <img class="proposal-logo" src="assets/antava-logo.png" alt="АНТАВА">
      <div class="company-details">
        <b>${safe(company.name)}</b>
        <div>ОГРН: ${safe(company.ogrn)}</div>
        <div>ИНН/КПП: ${safe(company.inn)} / ${safe(company.kpp)}</div>
        <div>${safe(company.address)}</div>
        <div>Тел.: ${safe(company.phone)}</div>
        <div>E-mail: ${safe(company.email)}</div>
      </div>
    </div>
    <div class="letter-details">
      <div class="outgoing-details">
        <div>${proposalDate} № ${safe($("#proposalNumber").value)}</div>
        ${replyLine}
      </div>
      <div class="recipient-details">
        ${recipientLines.map((line, index) => `<div class="${index === recipientLines.length - 1 && $("#recipientAddress").value ? "recipient-address" : ""}">${safe(line)}</div>`).join("")}
      </div>
    </div>
    ${recipientGreeting() ? `<p class="proposal-intro">${safe(recipientGreeting())}</p>` : ""}
    ${$("#preTableText").value.trim() ? `<div class="proposal-free-text">${richTextHtml($("#preTableText").value)}</div>` : ""}
    ${documentType === "letter" ? "" : (activeRows.length && proposalColumns.length ? `<table class="proposal-table ${compact ? "proposal-table-compact" : ""}">${proposalColgroup(proposalColumns)}<thead><tr><th>№</th>${proposalColumns.map(column => `<th class="${proposalCellClass(column)}">${safe(column.label)}</th>`).join("")}</tr></thead><tbody>
      ${activeRows.map((row, index) => `<tr><td>${index + 1}</td>${proposalColumns.map(column => `<td class="${proposalCellClass(column)}">${safe(displayValue(row, column))}</td>`).join("")}</tr>`).join("")}
    </tbody></table>` : `<div class="empty-state">Добавьте позиции и выберите столбцы для вывода в КП.</div>`)}
    ${documentType === "proposal" ? `<div class="proposal-total">
      <div><span>Итого без НДС:</span><b>${money.format(sale)}</b></div>
      <div><span>НДС ${number.format(numeric($("#vatRate").value))}%:</span><b>${money.format(vat)}</b></div>
      <div class="grand"><span>Итого с НДС:</span><span>${money.format(grand)}</span></div>
    </div>` : ""}
    ${documentType === "proposal" && $("#postTableText").value.trim() ? `<div class="proposal-free-text proposal-free-text-after">${richTextHtml($("#postTableText").value)}</div>` : ""}
    <div class="signature">
      <div><b>${safe($("#signatoryPosition").value || "Генеральный директор")}</b></div>
      <div class="signature-line">________________</div>
      <div class="signature-name">${safe($("#signatoryName").value || "Батурина Татьяна Алексеевна")}</div>
    </div>
    ${executorContactHtml() ? `<div class="executor-contact">${executorContactHtml()}</div>` : ""}`;
  showTab("proposal");
}

function setAuthMessage(message, success = false) {
  const output = $("#authMessage");
  output.textContent = message;
  output.style.color = success ? "#376c4a" : "#b63820";
}

function showAuthScreen(show) {
  $("#authScreen").hidden = !show;
}

async function activateCloudSession(user) {
  cloudUser = user;
  cloudReady = Boolean(user);
  $("#cloudUser").textContent = user?.email || "";
  $("#cloudUser").hidden = !user;
  $("#signOutButton").hidden = !user;
  showAuthScreen(!user);
  if (user) {
    await migrateLocalCacheToCloud();
    await loadCloudData();
  }
}

async function signIn() {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  if (!email || !password) {
    setAuthMessage("Введите электронную почту и пароль.");
    return;
  }
  setAuthMessage("Выполняется вход…", true);
  const { data, error } = await cloudClient.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthMessage(error.message);
    return;
  }
  await activateCloudSession(data.user);
}

async function signOut() {
  await cloudClient.auth.signOut();
  cloudReady = false;
  cloudUser = null;
  showAuthScreen(true);
  $("#cloudUser").hidden = true;
  $("#signOutButton").hidden = true;
}

async function initializeCloud() {
  const config = window.APP_SUPABASE_CONFIG;
  if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
    console.warn("Cloud configuration is unavailable; local mode is active.");
    return;
  }
  cloudClient = window.supabase.createClient(config.url, config.anonKey);
  const { data, error } = await cloudClient.auth.getSession();
  if (error) {
    console.error(error);
    showAuthScreen(true);
    return;
  }
  if (data.session?.user) await activateCloudSession(data.session.user);
  else showAuthScreen(true);
}

$("#addRowButton").addEventListener("click", () => addRow());
$("#columnsButton").addEventListener("click", () => {
  const panel = $("#columnsPanel");
  panel.hidden = !panel.hidden;
  $("#columnsButton").textContent = panel.hidden ? "Настроить столбцы" : "Скрыть настройку";
});
$("#addColumnButton").addEventListener("click", addColumn);
$("#saveButton").addEventListener("click", save);
$("#newProposalButton").addEventListener("click", newProposal);
$("#newLetterButton").addEventListener("click", newLetter);
$("#signInButton").addEventListener("click", signIn);
$("#signOutButton").addEventListener("click", signOut);
$("#authPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") signIn();
});
$("#excelButton").addEventListener("click", exportToExcel);
$("#backButton").addEventListener("click", () => showTab("calculation"));
$("#proposalExcelButton").addEventListener("click", exportToExcel);
$("#printButton").addEventListener("click", prepareProposalForOutput);
$("#pdfButton").addEventListener("click", saveAsPdf);
$$(".tab").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.tab === "proposal") generateProposal();
  else {
    if (button.dataset.tab === "history") renderHistory();
    showTab(button.dataset.tab);
  }
}));
formFields.forEach(id => $(`#${id}`).addEventListener("input", updateSummary));
$("#recipientName").addEventListener("input", updateGreetingPlaceholder);
$("#executorName").addEventListener("change", updateExecutorExtension);
$("#recipientDatabaseSelect").addEventListener("change", fillRecipientFromDatabase);
$("#deleteRecipientButton").addEventListener("click", deleteSelectedRecipient);
$$(".rich-editor").forEach(editor => {
  editor.addEventListener("input", () => syncRichEditor(editor));
});
$$(".rich-toolbar button[data-command]").forEach(button => {
  button.addEventListener("mousedown", event => event.preventDefault());
  button.addEventListener("click", () => {
    const editor = $(`#${button.closest(".rich-toolbar").dataset.editor}`);
    editor.focus();
    document.execCommand(button.dataset.command, false, null);
    syncRichEditor(editor);
  });
});
tbody.addEventListener("paste", pasteExcelRange);

load();
updateGreetingPlaceholder();
syncEditorsFromState();
applyDocumentTypeUI();
if (!$("#proposalDate").value) {
  $("#proposalDate").value = todayInputValue();
}
renderColumnsPanel();
renderTable();
updateSummary();
renderHistory();
migrateRecipientsFromHistory();
renderRecipientDatabase();
initializeCloud().catch(error => {
  console.error(error);
  setAuthMessage("Не удалось подключиться к общей базе.");
  showAuthScreen(true);
});
