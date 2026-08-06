const MALE_FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
"Krishna", "Ishaan", "Shaurya", "Atharv", "Advik", "Pranav", "Kabir", "Rudra",
"Rahul", "Amit", "Suresh", "Rajesh", "Vikram", "Sanjay", "Deepak", "Manoj",
"Rohan", "Karan", "Varun", "Rohit", "Ankit", "Nikhil", "Akash", "Abhishek",
"Ansh", "Anshul", "Aryan", "Arnav", "Aadi", "Aarush", "Aayush", "Abhinav",
"Abhimanyu", "Abhay", "Abeer", "Advay", "Agastya", "Ahan", "Akhil", "Akshay",
"Alok", "Amar", "Amay", "Aman", "Amol", "Anand", "Anirudh", "Anirban",
"Anuj", "Anup", "Anurag", "Armaan", "Arpit", "Arvind", "Ashish", "Ashok",
"Ashwin", "Atul", "Avinash", "Ayush", "Bharat", "Bhavesh", "Bhanu", "Bhuvan",
"Chandan", "Chetan", "Chirag", "Darshan", "Dev", "Devaansh", "Devansh", "Devendra",
"Dhruv", "Dheeraj", "Dhanush", "Dilip", "Divyansh", "Eshan", "Gaurav", "Girish",
"Govind", "Harsh", "Harshit", "Harshvardhan", "Himanshu", "Hriday", "Ivaan", "Jai",
"Jatin", "Jay", "Jayant", "Jignesh", "Kailash", "Kartik", "Kartikeya", "Keshav",
"Kunal", "Laksh", "Lakshay", "Lalit", "Lokesh", "Madhav", "Mahesh", "Manav",
"Manish", "Mayank", "Mihir", "Mohit", "Mukesh", "Nakul", "Naman", "Naveen",
"Navin", "Neel", "Neeraj", "Nishant", "Nitin", "Om", "Omkar", "Pankaj",
"Parth", "Parthiv", "Piyush", "Pradeep", "Prakash", "Pranav", "Pratham", "Pratik",
"Prem", "Raghav", "Raghavendra", "Raj", "Rajat", "Rajeev", "Rajiv", "Rakesh",
"Ramesh", "Ranbir", "Ranjit", "Ravi", "Ravindra", "Rishabh", "Rishi", "Ritesh",
"Rituraj", "Ronit", "Roshan", "Sachin", "Sagar", "Sahil", "Sameer", "Samarth",
"Samir", "Sandeep", "Sarthak", "Sarvesh", "Shailesh", "Shiv", "Shivam", "Shivansh",
"Shlok", "Shrey", "Shreyansh", "Shubham", "Siddharth", "Siddhant", "Sohan", "Soham",
"Somesh", "Sourabh", "Sourav", "Suraj", "Surya", "Tanish", "Tanishq", "Tarun",
"Tejas", "Uday", "Ujjwal", "Utkarsh", "Vaibhav", "Varad", "Ved", "Vedant",
"Veer", "Venkatesh", "Vijay", "Vineet", "Vinit", "Vishal", "Vishesh", "Vivek",
"Yash", "Yashwant", "Yatin", "Yuvraj", "Zaid", "Zayan", "Aariv", "Aariz",
"Abeer", "Adit", "Adwait", "Agnivesh", "Akhilesh", "Alokesh", "Amrit", "Anay",
"Angad", "Aniket", "Ankit", "Anmol", "Anshuman", "Arhaan", "Arjit", "Arjun",
"Arnav", "Arun", "Arush", "Ashutosh", "Atharva", "Avyan", "Ayansh", "Brijesh",
"Chaitanya", "Chirantan", "Daksh", "Dakshesh", "Darsh", "Devraj", "Dhanraj", "Dhaval",
"Digvijay", "Dinesh", "Divit", "Durgesh", "Eklavya", "Faizan", "Fardeen", "Farhan",
"Gagan", "Gautam", "Girish", "Gokul", "Gopal", "Gyan", "Hardik", "Hari",
"Harish", "Hemant", "Hitesh", "Inder", "Indrajeet", "Ishwar", "Jagat", "Jagdish",
"Janak", "Jaspreet", "Javed", "Jayesh", "Jeevan", "Kamal", "Kanishk", "Kapil",
"Karanveer", "Kartik", "Kaushal", "Kavin", "Kedar", "Keshav", "Khushal", "Kishan",
"Kishore", "Krish", "Krishiv", "Kshitij", "Kumar", "Kunwar", "Laxman", "Madan",
"Mahavir", "Manan", "Manav", "Mandar", "Mangesh", "Manthan", "Mayur", "Mukul",
"Mukund", "Nakul", "Nandan", "Nandish", "Narendra", "Narayana", "Naresh", "Naveen",
"Navneet", "Neer", "Nihal", "Nilesh", "Nirav", "Nirbhay", "Nirmal", "Nishit",
"Nitesh", "Niranjan", "Ojas", "Omendra", "Pankaj", "Parag", "Paras", "Pavan",
"Prabhat", "Prakash", "Pranesh", "Prateek", "Pratyush", "Pravin", "Priyansh", "Pulkit",
"Rachit", "Raghu", "Raghunath", "Rahul", "Rajendra", "Rajesh", "Rajnish", "Rajat",
"Rakesh", "Raman", "Ramesh", "Ranjeet", "Ranveer", "Ratan", "Ratnesh", "Ravish",
"Ravikant", "Raghav", "Rehan", "Rishan", "Rishit", "Ritesh", "Rituraj", "Rohin",
"Ronav", "Rudransh", "Rupesh", "Sachin", "Sahil", "Samar", "Samay", "Samarjeet",
"Sameer", "Sanket", "Sankalp", "Sarthak", "Satish", "Satyam", "Satyendra", "Saurabh",
"Saurav", "Shankar", "Shantanu", "Sharad", "Shashank", "Shekhar", "Shivendra", "Shivraj",
"Shreyas", "Shubhan", "Shubh", "Siddhesh", "Sikandar", "Sohan", "Sohil", "Somnath",
"Sonu", "Sparsh", "Srihan", "Srinivas", "Subhash", "Sudhir", "Sujal", "Sukesh",
"Sumit", "Sunil", "Surendra", "Suresh", "Swapnil", "Tapan", "Tapas", "Tej",
"Tejas", "Tushar", "Umesh", "Upendra", "Utpal", "Vansh", "Varad", "Vardhan",
"Vasu", "Vatsal", "Vedansh", "Veeransh", "Vibhor", "Vicky", "Vidhur", "Vijendra",
"Vikas", "Vikrant", "Vimal", "Vinay", "Vinod", "Vipul", "Viraj", "Viren",
"Virendra", "Vishnu", "Vishwas", "Vivan", "Vivekanand", "Yashas", "Yashraj", "Yogesh",
"Yuvansh", "Yuvan", "Zoravar", "Abeer", "Adit", "Advaith", "Agnik", "Ahan",
"Akarsh", "Akshat", "Amey", "Amogh", "Anvay", "Arhaan", "Arush", "Atharv",
"Avik", "Avinash", "Ayushman", "Bhuvik", "Bodhi", "Devanshu", "Devit", "Dhairya",
"Dhruv", "Ekansh", "Harshil", "Hridhaan", "Ivaan", "Jash", "Jashan", "Jatin",
"Kairav", "Kairav", "Kiaan", "Kiaan", "Kriday", "Krishang", "Lakshya", "Luv",
"Maan", "Manas", "Moksh", "Naksh", "Naitik", "Nivaan", "Nivansh", "Ojas",
"Parv", "Pradyumn", "Pranshu", "Riaan", "Rian", "Ronav", "Rudraksh", "Saanvi",
"Samarth", "Shivay", "Shreyans", "Taarush", "Taksh", "Tavish", "Tushit", "Vayun",
"Vedik", "Viresh", "Vivan", "Yuvaan", "Aaryan", "Aaryav", "Aariv", "Aarush",
"Abhir", "Abhiraj", "Abhiraaj", "Abhishek", "Adarsh", "Adesh", "Ainesh", "Ajay",
"Ajit", "Amod", "Anant", "Anirvan", "Anshraj", "Arav", "Arindam", "Arunesh",
"Ashray", "Avdesh", "Balraj", "Balram", "Bhargav", "Bhuvanesh", "Chirayu", "Darpan",
"Darshil", "Devesh", "Dhairav", "Dhrupad", "Eshwar", "Gaurang", "Girish", "Harin",
"Harendra", "Harshad", "Indrajeet", "Jairaj", "Jitesh", "Kush", "Kushal", "Lohit",
"Mahendra", "Manendra", "Mitesh", "Nagesh", "Nandan", "Naveen", "Nirmit", "Pritam",
"Rachit", "Ragav", "Rajveer", "Rishabh", "Rohit", "Rudra", "Samar", "Sanjay",
"Saransh", "Shail", "Shashwat", "Shivanshu", "Siddhant", "Smit", "Srijan", "Sudarshan",
"Suryaansh", "Tanmay", "Tarak", "Tavish", "Utsav", "Vansh", "Varun", "Vatsal",
"Vihan", "Vijay", "Vikram", "Virat", "Vishant", "Yatin", "Yogendra", "Yuvraj"
];

const FEMALE_FIRST_NAMES = [
  "Ananya", "Aadhya", "Diya", "Myra", "Saanvi", "Anika", "Navya", "Ira",
  "Kiara", "Pari", "Riya", "Meera", "Kavya", "Ishita", "Priya", "Neha",
  "Pooja", "Sunita", "Anjali", "Kavita", "Sneha", "Nisha", "Rekha", "Geeta",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Iyer",
  "Nair", "Joshi", "Mehta", "Agarwal", "Malhotra", "Chopra", "Kapoor", "Bansal",
  "Yadav", "Mishra", "Pandey", "Thakur", "Rao", "Desai", "Kulkarni", "Menon",
  "Saxena", "Tiwari", "Dubey", "Srivastava", "Bhatia", "Chauhan",
];

const AGE_OPTIONS = ["< 50 years", "> 50 years"];
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

/** ~90% Male, ~10% Female */
export function pickWeightedGender() {
  return Math.random() < 0.9 ? "Male" : "Female";
}

export function generateRandomIndianName(gender = pickWeightedGender()) {
  const firstNames = gender === "Male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  return `${pickOne(firstNames)} ${pickOne(LAST_NAMES)}`;
}

export function generateRandomAnswers(gender = pickWeightedGender()) {
  return {
    age: pickOne(AGE_OPTIONS),
    gender,
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
