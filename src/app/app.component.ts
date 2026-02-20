import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Coco Colima - AWS Amplify Presentation';

  // Connection Form Data
  url: string = '';
  username: string = '';
  password: string = '';
  companyDb: string = '';

  // UI State
  loading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  // App State after connection
  isConnected: boolean = false;
  sessionId: string = '';

  // Articles Data
  items: any[] = [];
  loadingItems: boolean = false;
  itemsError: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    // Recuperar credenciales al cargar la página (Variables de Entorno o local)
    this.url = environment.url || localStorage.getItem('amplifyDemo_url') || '';
    this.companyDb = environment.companyDb || localStorage.getItem('amplifyDemo_companyDb') || '';
    this.username = environment.username || localStorage.getItem('amplifyDemo_username') || '';
    this.password = environment.password || localStorage.getItem('amplifyDemo_password') || '';
  }

  onConnect() {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.url || !this.username || !this.password || !this.companyDb) {
      this.errorMessage = 'Por favor, complete todos los campos de conexión.';
      return;
    }

    this.loading = true;

    // Guardar credenciales para la próxima vez
    localStorage.setItem('amplifyDemo_url', this.url);
    localStorage.setItem('amplifyDemo_companyDb', this.companyDb);
    localStorage.setItem('amplifyDemo_username', this.username);
    localStorage.setItem('amplifyDemo_password', this.password);

    // To bypass CORS in local demo we use the reverse proxy set in proxy.conf.json 
    // In local (production: false) we use the relative path '/b1s/v2' so proxy intercepts it
    // In production (Amplify) we must use the full URL directly provided by the user
    let apiPath = '/b1s/v2';

    if (environment.production) {
      // Remove trailing slash if any
      apiPath = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
    }

    const fullUrl = `${apiPath}/Login`;

    const body = {
      CompanyDB: this.companyDb,
      UserName: this.username,
      Password: this.password
    };

    const options = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    this.http.post(fullUrl, body, options).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.isConnected = true;
        this.sessionId = response?.SessionId || '';
        this.successMessage = `¡Conexión exitosa a ServiceLayer! SessionId: ${this.sessionId}`;
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 0) {
          this.errorMessage = 'Error de conexión. Es posible que el servidor no sea accesible, que la URL sea incorrecta, o que haya un problema de CORS (Cross-Origin Resource Sharing). Revisa que ServiceLayer tenga CORS configurado.';
        } else {
          this.errorMessage = `Error al conectar: ${err.error?.error?.message?.value || err.message}`;
        }
      }
    });
  }

  fetchItems() {
    this.loadingItems = true;
    this.itemsError = '';

    // We do exactly the same for GET /Items to bypass CORS in dev or use full url in prod
    let apiPath = '/b1s/v2';
    if (environment.production) {
      apiPath = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
    }

    const itemsUrl = `${apiPath}/Items?$top=5&$select=ItemCode,ItemName`;

    const options = {
      withCredentials: true, // Necesario para que el navegador envíe la cookie B1SESSION
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    this.http.get(itemsUrl, options).subscribe({
      next: (response: any) => {
        this.loadingItems = false;
        this.items = response?.value || [];
      },
      error: (err) => {
        this.loadingItems = false;
        if (err.status === 0) {
          this.itemsError = 'Error de conexión. Es posible que haya un problema de CORS o con las cookies en ServiceLayer.';
        } else {
          this.itemsError = `Error al obtener artículos: ${err.error?.error?.message?.value || err.message}`;
        }
      }
    });
  }
}

