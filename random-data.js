const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
  "Krishna", "Ishaan", "Shaurya", "Atharv", "Advik", "Pranav", "Kabir", "Rudra",
  "Ananya", "Aadhya", "Diya", "Myra", "Saanvi", "Anika", "Navya", "Ira",
  "Kiara", "Pari", "Riya", "Meera", "Kavya", "Ishita", "Priya", "Neha",
  "Rahul", "Amit", "Suresh", "Rajesh", "Vikram", "Sanjay", "Deepak", "Manoj",
  "Pooja", "Sunita", "Anjali", "Kavita", "Sneha", "Nisha", "Rekha", "Geeta",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Iyer",
  "Nair", "Joshi", "Mehta", "Agarwal", "Malhotra", "Chopra", "Kapoor", "Bansal",
  "Yadav", "Mishra", "Pandey", "Thakur", "Rao", "Desai", "Kulkarni", "Menon",
  "Saxena", "Tiwari", "Dubey", "Srivastava", "Bhatia", "Chauhan",
];

const AGE_OPTIONS = ["< 50 years", "> 50 years"];
const GENDER_OPTIONS = ["Female", "Others", "Male"];
const YES_NO_OPTIONS = ["Yes", "No"];

const CLINICAL_CONDITIONS = [
  "Diabetes",
  "High Blood pressure",
  "High Cholesterol",
  "Anaemic",
];

const DISORDERS = [
  "Liver disease",
  "Kidney disease",
  "Endocrine disease  (e.g.Thyroid disease)",
];

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickSome(items) {
  const count = Math.floor(Math.random() * (items.length + 1));
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateRandomIndianName() {
  return `${pickOne(FIRST_NAMES)} ${pickOne(LAST_NAMES)}`;
}

export function generateRandomAnswers() {
  return {
    age: pickOne(AGE_OPTIONS),
    gender: pickOne(GENDER_OPTIONS),
    swellingBothLegs: pickOne(YES_NO_OPTIONS),
    swellingWorseEvening: pickOne(YES_NO_OPTIONS),
    swellingAllOverBody: pickOne(YES_NO_OPTIONS),
    swellingFaceMorning: pickOne(YES_NO_OPTIONS),
    breathingDifficulty: pickOne(YES_NO_OPTIONS),
    breathingDifficultyLying: pickOne(YES_NO_OPTIONS),
    breathingDifficultyWalking: pickOne(YES_NO_OPTIONS),
    clinicalConditions: pickSome(CLINICAL_CONDITIONS),
    disorders: pickSome(DISORDERS),
  };
}
