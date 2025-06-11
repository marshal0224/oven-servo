// input format: Letter (ramp [U]p or [D]own) int (starting PWM) int (seconds per 1 PWM up) int (target PWM)
// normal output format:  int I (current); int V (voltage); int P (power); double S (power setpoint); double R (effective power stabilization range as a percentage, turns of stabilization beyond +- r) 
// special output format: %%Letter

volatile int rampTimer = 0; // time iterator, always start with 0

volatile int rampNum = 0; // PWM value placeholder, change the starting value as needed
volatile int rampPeriod = 0; // period of PWM steps by seconds, change as needed
volatile int rampMax = 0; // upper bound of the PWM output value

volatile bool currentOn = true;
volatile bool PIDOn = false;
volatile double setpoint = 1;
volatile double range = 0.05;

volatile char* letter; // placeholder for incoming command letter
volatile double numbers[4]; // placeholder for incoming parameters
volatile char commandBuffer[50];

void setup() {
  analogReference(EXTERNAL);
  #ifndef ESP8266
    while (!Serial);     // will pause Zero, Leonardo, etc until serial console opens
  #endif
  Serial.begin(9600);
  
  pinMode(6, OUTPUT); // signal channel driving the PWM value to the constant current source
  pinMode(A0, INPUT);
  pinMode(A1, INPUT);
  pinMode(A2, INPUT); // fuse channel that listens for the flow meter signal and force PWM output to 0 if there is no water

  analogWrite(6, 0);
}

void rampUp() {
  if (!PIDOn) {
    analogWrite(6, rampNum);
    rampTimer += 1;
    if (rampTimer == rampPeriod && currentOn && (rampNum < rampMax)) { 
      rampNum += 1;
      rampTimer = 0;
    } 
  } else {
    Serial.println("%%P");
    double plus = 2.5 / 1023.0 * abs(analogRead(A1)) * 16;
    double minus = 2.5 / 1023.0 * abs(analogRead(A0)) * 19;
    double v = plus - minus;
    double k = 51.0 / 14000.0;
    double b = 3.0 / 140.0;
    double i = rampNum * k + b;
    double p = v * i; 
    double diff = 0;
    if (setpoint > p) {diff = setpoint - p;}
    else if (setpoint < p) {diff = p - setpoint;}
    if (diff / setpoint > range) {
      int d = int((diff / v - b) / k);
      if (setpoint > p) {rampNum += d;}
      else if (setpoint < p) {rampNum -= d;}
    }
    if (abs(rampNum) >= 255) {
      Serial.println("57");
      Serial.println(abs(rampNum));
      Serial.println("%%p");
      rampNum = rampMax;
      PIDOn = false;
    }
    analogWrite(6, rampNum);
  }
  if (rampNum == rampMax) {
    Serial.println("%%C");
  }
  delay(500);
}

void rampDown() {
  if (rampNum >=1 && rampTimer % 5 == 0) {
    rampNum -= 1;
    analogWrite(6, rampNum);
  } 
  if (rampNum == 0) {
    Serial.println("%%C");
  }
  rampTimer += 1;
  delay(500);
}

void loop() {
  if (analogRead(A2) > 1000) {
    rampNum = 0;
    Serial.println("%%F");
  }
  Serial.print("I");
  Serial.print(rampNum);
  Serial.print("P");
  Serial.print(analogRead(A1));
  Serial.print("M");
  Serial.println(analogRead(A0));
  Serial.print("S");
  Serial.print(setpoint);
  Serial.print("R");
  Serial.println(range);
  // Serial.println(analogRead(A1));
  // Serial.println(analogRead(A0));
  delay(500);
  // see if there's incoming serial data:
  if (Serial.available() > 0) {
    // read the oldest byte in the serial buffer:
    // Serial.println("picked up command");
    String command = Serial.readString();
    command.toCharArray(commandBuffer, sizeof(commandBuffer));
    // Split the command into words and numbers
    letter = strtok(commandBuffer, " ");
    letter[strcspn(letter, "\n\r")] = 0;
    int i = 0;
    char* number = strtok(NULL, " ");
    while (number != NULL) {
      numbers[i] = atof(number);
      i++;
      number = strtok(NULL, " ");
    }
  }
  // if it's a capital U, start ramping up:
  if (strcmp(letter, "U") == 0) {
    Serial.println("%%U");
    rampNum = numbers[0];
    rampPeriod = numbers[1];
    rampMax = numbers[2];
    rampTimer = 0;
    rampUp();
    letter = "u"; // this is to prevent the parameters from resetting in each loop
  } 
  // if the parameters have been set already, just ramp up. 
  else if (strcmp(letter, "u") == 0) {
    rampUp();
  }
  // if it's a D, start ramping down:
  else if (strcmp(letter, "D") == 0) {
    Serial.println("%%D");
    Serial.println("%%p");
    rampTimer = 0;
    letter = "d";
  } else if (strcmp(letter, "d") == 0) {
    rampDown();
  } else if (strcmp(letter, "P") == 0) {
    Serial.println("%%P");
    PIDOn = true;
    letter = "u";
  } else if (strcmp(letter, "p") == 0) {
    Serial.println("%%p");
    PIDOn = false;
    letter = "u";
    rampNum = rampMax;
  } else if (strcmp(letter, "s") == 0) {
    setpoint = numbers[0];
    range = numbers[1] / 100.0;
  }
  delay(500);
}