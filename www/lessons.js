// Static, fully offline programming-lessons content for the "Уроки" screen.
// No network calls, no model calls — this is just local data.
window.AI_ASSISTANT_LESSONS = {
  "JavaScript": [
    {
      title: "Переменные и типы",
      explanation: "В JavaScript переменные объявляются через let/const. let — можно менять значение, const — нельзя переназначить.",
      code: "let count = 1;\nconst name = \"Аня\";\ncount = count + 1;\nconsole.log(count, name);",
      quiz: { q: "Можно ли изменить значение переменной, объявленной через const?", a: "Нет, но если это объект/массив — можно менять его содержимое, просто нельзя переназначить саму переменную." }
    },
    {
      title: "Функции и стрелочные функции",
      explanation: "Функцию можно объявить классически или через стрелочный синтаксис (короче, не создаёт свой this).",
      code: "function add(a, b) {\n  return a + b;\n}\nconst addArrow = (a, b) => a + b;\nconsole.log(add(2, 3), addArrow(2, 3));",
      quiz: { q: "Чем стрелочная функция отличается от обычной в контексте this?", a: "Стрелочная функция не создаёт свой this — она берёт this из окружающего контекста." }
    },
    {
      title: "Массивы и map/filter",
      explanation: "map преобразует каждый элемент массива, filter отбирает элементы по условию.",
      code: "const nums = [1, 2, 3, 4, 5];\nconst doubled = nums.map(n => n * 2);\nconst even = nums.filter(n => n % 2 === 0);\nconsole.log(doubled, even);",
      quiz: { q: "Изменяет ли map исходный массив?", a: "Нет, map возвращает новый массив, исходный остаётся неизменным." }
    }
  ],
  "Python": [
    {
      title: "Переменные и типы данных",
      explanation: "В Python не нужно объявлять тип переменной явно — интерпретатор определяет его сам.",
      code: "count = 1\nname = \"Аня\"\ncount += 1\nprint(count, name)",
      quiz: { q: "Нужно ли явно указывать тип переменной в Python?", a: "Нет, типизация динамическая — тип определяется в момент присваивания значения." }
    },
    {
      title: "Списки и list comprehension",
      explanation: "List comprehension — компактный способ создать новый список на основе существующего.",
      code: "nums = [1, 2, 3, 4, 5]\ndoubled = [n * 2 for n in nums]\neven = [n for n in nums if n % 2 == 0]\nprint(doubled, even)",
      quiz: { q: "Что делает конструкция [x for x in lst if cond]?", a: "Создаёт новый список из элементов lst, прошедших проверку cond." }
    },
    {
      title: "Функции и значения по умолчанию",
      explanation: "Функции объявляются через def, параметрам можно задать значения по умолчанию.",
      code: "def greet(name, greeting=\"Привет\"):\n    return f\"{greeting}, {name}!\"\n\nprint(greet(\"Мир\"))",
      quiz: { q: "Что произойдёт, если не передать аргумент greeting?", a: "Будет использовано значение по умолчанию — \"Привет\"." }
    }
  ],
  "Java": [
    {
      title: "Классы и объекты",
      explanation: "Java — объектно-ориентированный язык: весь код живёт внутри классов.",
      code: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Привет, мир!\");\n  }\n}",
      quiz: { q: "Какой метод является точкой входа в Java-приложение?", a: "public static void main(String[] args)." }
    },
    {
      title: "Типизация переменных",
      explanation: "Java — статически типизированный язык: тип переменной указывается явно при объявлении.",
      code: "int count = 1;\nString name = \"Аня\";\ncount = count + 1;\nSystem.out.println(count + \" \" + name);",
      quiz: { q: "Можно ли присвоить переменной типа int строковое значение?", a: "Нет, без явного преобразования это вызовет ошибку компиляции." }
    }
  ],
  "Go": [
    {
      title: "Переменные и вывод",
      explanation: "В Go переменные объявляются через var или короткую форму :=, вывод — через пакет fmt.",
      code: "package main\n\nimport \"fmt\"\n\nfunc main() {\n  count := 1\n  name := \"Аня\"\n  fmt.Println(count, name)\n}",
      quiz: { q: "Что делает оператор := в Go?", a: "Объявляет новую переменную и сразу выводит её тип из присваиваемого значения." }
    },
    {
      title: "Слайсы",
      explanation: "Слайс — динамический массив в Go, создаётся через make или литерал.",
      code: "nums := []int{1, 2, 3, 4, 5}\nnums = append(nums, 6)\nfmt.Println(nums)",
      quiz: { q: "Чем слайс отличается от обычного массива в Go?", a: "Слайс имеет динамическую длину и может расти через append, массив — фиксированного размера." }
    }
  ]
};
