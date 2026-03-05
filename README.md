# Лабораторна робота №10
![Node.js CI](https://github.com/Darkc0de-nvm/qa-mocking-lab/actions/workflows/ci.yml/badge.svg)

## ℹ️ Статус автоматизації
Всі тести та перевірки покриття коду виконуються автоматично при кожному push або pull request.

* **GitHub Actions Run:** [🚀 Преглянути статус тестів](https://github.com/Darkc0de-nvm/qa-mocking-lab/actions/runs/22731163693)
* **Pull Request:** [✈️ Переглянути PR #4](https://github.com/this4you/qa-mocking-lab/pull/4)

## 📊 Звіти про тестування

### 1.  Результати GitHub Actions (CI)
<details>
  
<summary>📸 КЛІКНІТЬ ТУТ, щоб переглянути скріншот Actions</summary>

<img width="1085" height="609" alt="зображення" src="https://github.com/user-attachments/assets/6279dd19-3d4a-4663-9263-5b3089f7d273" />
</details>

### 2.  Результати локального тестування (coverage)
<details>
  
<summary>📸 КЛІКНІТЬ ТУТ, щоб переглянути coverage-тест</summary>

<img width="652" height="213" alt="зображення" src="https://github.com/user-attachments/assets/82e875c9-e987-4f6d-a6c5-126c048e61af" />
</details
  
---
## </> Як запустити
1. 🤝 Встановіть залежності
```
npm install
```
2. 📝 Загальне тестування
```
npm test
```
3. 📊 Тестування з перевіркою покриття
```
npm run test:coverage
```
або ж
```
npm test -- --coverage
```

> [!IMPORTANT]
> ### ⚠️ Помилка при встановленні залежностей
> Якщо ви отримали помилку `exit code -4051`, виконайте наступне:
> 1. Видаліть папку `node_modules`
> 2. Видаліть файл `package-lock.json`
> 3. Запустіть повторно `npm install`
