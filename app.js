let config;
let baseUrl;
let headers;
let editingId = null;
let allTasks = [];
let activeFilter = 'all';
let searchTerm = '';

const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const descInput = document.getElementById('task-description');
const submitBtn = document.getElementById('task-submit');
const cancelEditBtn = document.getElementById('cancel-edit');
const list = document.getElementById('task-list');
const statusEl = document.getElementById('status-message');
const searchInput = document.getElementById('task-search');
const visibleCount = document.getElementById('visible-count');
const totalCount = document.getElementById('total-count');
const activeCount = document.getElementById('active-count');
const completedCount = document.getElementById('completed-count');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function api(path, options = {}) {
  if (!baseUrl || !config?.tableName) {
    throw new Error('The app is not connected to its configuration.');
  }

  const response = await fetch(`${baseUrl}/${encodeURIComponent(config.tableName)}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Request failed (${response.status})`);
  }

  const responseText = await response.text();
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('The server returned an unexpected response.');
  }
}

function updateOverview() {
  const completed = allTasks.filter(task => task.completed).length;
  totalCount.textContent = allTasks.length;
  activeCount.textContent = allTasks.length - completed;
  completedCount.textContent = completed;
}

function getVisibleTasks() {
  return allTasks.filter(task => {
    const matchesFilter = activeFilter === 'all'
      || (activeFilter === 'active' && !task.completed)
      || (activeFilter === 'completed' && task.completed);

    const searchableText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    return matchesFilter && searchableText.includes(searchTerm);
  });
}

function makeButton(label, className, onClick, ariaLabel = label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onClick);
  return button;
}

function renderTask(task) {
  const item = document.createElement('article');
  item.className = `task-item${task.completed ? ' done' : ''}`;
  item.dataset.id = task.id;

  const checkButton = makeButton(
    task.completed ? '✓' : '✓',
    'task-check',
    () => toggleTask(task),
    task.completed ? `Mark ${task.title} as active` : `Mark ${task.title} as completed`
  );
  checkButton.setAttribute('aria-pressed', String(Boolean(task.completed)));

  const main = document.createElement('div');
  main.className = 'task-main';

  const topline = document.createElement('div');
  topline.className = 'task-topline';

  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title || 'Untitled task';

  const status = document.createElement('span');
  status.className = 'task-status';
  status.textContent = task.completed ? 'Completed' : 'In progress';

  topline.append(title, status);
  main.appendChild(topline);

  if (task.description) {
    const description = document.createElement('p');
    description.className = 'task-description';
    description.textContent = task.description;
    main.appendChild(description);
  }

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  actions.append(
    makeButton(task.completed ? 'Reopen' : 'Complete', 'action-button', () => toggleTask(task)),
    makeButton('Edit', 'action-button', () => startEdit(task)),
    makeButton('Delete', 'action-button delete', () => deleteTask(task.id))
  );
  main.appendChild(actions);

  item.append(checkButton, main);
  return item;
}

function render() {
  updateOverview();
  const visibleTasks = getVisibleTasks();
  visibleCount.textContent = visibleTasks.length;
  list.replaceChildren();

  if (visibleTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    const illustration = document.createElement('div');
    illustration.className = 'empty-illustration';
    illustration.textContent = searchTerm ? '⌕' : '✳';

    const heading = document.createElement('strong');
    const message = document.createElement('p');

    if (searchTerm) {
      heading.textContent = 'No matching tasks';
      message.textContent = 'Try another search word or switch to a different filter.';
    } else if (activeFilter === 'completed') {
      heading.textContent = 'Nothing completed yet';
      message.textContent = 'Finished tasks will appear here. You have got this.';
    } else if (activeFilter === 'active') {
      heading.textContent = 'You are all caught up';
      message.textContent = 'There are no active tasks right now. Enjoy the breathing room.';
    } else {
      heading.textContent = 'Your list starts here';
      message.textContent = 'Add your first task using the form, then keep track of it here.';
    }

    empty.append(illustration, heading, message);
    list.appendChild(empty);
    return;
  }

  visibleTasks.forEach(task => list.appendChild(renderTask(task)));
}

function startEdit(task) {
  editingId = task.id;
  titleInput.value = task.title || '';
  descInput.value = task.description || '';
  submitBtn.querySelector('span:last-child').textContent = 'Save changes';
  submitBtn.querySelector('.button-plus').textContent = '✓';
  cancelEditBtn.hidden = false;
  document.getElementById('composer-title').textContent = 'Edit task';
  titleInput.focus();
  setStatus(`Editing: ${task.title}`);
}

function resetForm() {
  editingId = null;
  form.reset();
  submitBtn.querySelector('span:last-child').textContent = 'Add task';
  submitBtn.querySelector('.button-plus').textContent = '＋';
  cancelEditBtn.hidden = true;
  document.getElementById('composer-title').textContent = 'Add a task';
}

async function refreshTasks() {
  const tasks = await api('?select=id,title,description,completed&order=id.asc');
  if (!Array.isArray(tasks)) {
    throw new Error('The tasks response was not a list. Check your Supabase table.');
  }
  allTasks = tasks;
  render();
}

async function loadTasks() {
  list.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>Loading your tasks...</div>';
  try {
    await refreshTasks();
    setStatus('');
  } catch (error) {
    list.replaceChildren();
    setStatus(`Could not load tasks: ${error.message}`, true);
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const heading = document.createElement('strong');
    heading.textContent = 'Could not connect';
    const message = document.createElement('p');
    message.textContent = 'Check config.json, your internet connection, and the Supabase table permissions.';
    empty.append(heading, message);
    list.appendChild(empty);
  }
}

async function toggleTask(task) {
  try {
    await api(`?id=eq.${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ completed: !task.completed })
    });
    await refreshTasks();
    setStatus(task.completed ? 'Task moved back to active.' : 'Nice work — task completed.');
  } catch (error) {
    setStatus(`Could not update task: ${error.message}`, true);
  }
}

async function deleteTask(id) {
  const task = allTasks.find(item => String(item.id) === String(id));
  const taskName = task?.title || 'this task';
  if (!window.confirm(`Delete "${taskName}"? This cannot be undone.`)) return;

  try {
    await api(`?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (String(editingId) === String(id)) resetForm();
    await refreshTasks();
    setStatus('Task deleted.');
  } catch (error) {
    setStatus(`Could not delete task: ${error.message}`, true);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const body = {
    title: titleInput.value.trim(),
    description: descInput.value.trim()
  };

  if (!body.title) {
    setStatus('Please enter a task name.', true);
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  try {
    if (editingId === null) {
      await api('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      });
      resetForm();
      await refreshTasks();
      setStatus('Task added to your list.');
    } else {
      const currentId = editingId;
      await api(`?id=eq.${encodeURIComponent(currentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      });
      resetForm();
      await refreshTasks();
      setStatus('Your changes have been saved.');
    }
  } catch (error) {
    setStatus(`Could not save task: ${error.message}`, true);
  } finally {
    submitBtn.disabled = false;
  }
});

cancelEditBtn.addEventListener('click', () => {
  resetForm();
  setStatus('Editing cancelled.');
});

searchInput.addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

document.querySelectorAll('.filter-button').forEach(button => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach(filterButton => {
      const isActive = filterButton === button;
      filterButton.classList.toggle('active', isActive);
      filterButton.setAttribute('aria-pressed', String(isActive));
    });
    render();
  });
});

document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    searchTerm = '';
    render();
    searchInput.blur();
  }
});

async function init() {
  try {
    const response = await fetch('./config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not read config.json (${response.status})`);

    config = await response.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey || !config.tableName) {
      throw new Error('config.json is missing a Supabase URL, publishable key, or table name.');
    }

    baseUrl = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
    headers = {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${config.supabasePublishableKey}`
    };

    await loadTasks();
  } catch (error) {
    setStatus(`Could not start the app: ${error.message}`, true);
    list.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const heading = document.createElement('strong');
    heading.textContent = 'Setup needed';
    const message = document.createElement('p');
    message.textContent = 'Make sure config.json is beside index.html and contains the correct Supabase settings.';
    empty.append(heading, message);
    list.appendChild(empty);
  }
}

init();
