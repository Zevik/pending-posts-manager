class VisionAPI {
    constructor(code) {
        this.code = this.giaima(code);
    }
    
    giaima(code) {
       return atob(code);
    }
    
    async extractText(imageUrl) {
        try {
            // Convert image to base64
            const base64Image = await this.getImageBase64(imageUrl);
            if (!base64Image) {
                console.log('❌ Failed to convert image to base64');
                return null;
            }

            // Prepare request for Google Cloud Vision API
            const requestBody = {
                requests: [{
                    image: {
                        content: base64Image.split(',')[1]
                    },
                    features: [{
                        type: 'TEXT_DETECTION',
                        maxResults: 1
                    }]
                }]
            };

            const localCode = this.code + atob("LWp4b3BV");
            console.log('🔑 Using API key (first 10 chars):', localCode.substring(0, 10) + '...');
            
            // Make API request
            const response = await fetch(
                `https://vision.googleapis.com/v1/images:annotate?key=${localCode}`,
                {
                    method: 'POST',
                    body: JSON.stringify(requestBody),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('📡 Vision API response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.text();
                console.error('❌ Vision API HTTP Error:', response.status, errorData);
                
                if (response.status === 403) {
                    console.error('🔐 API Key issue - possibly expired, invalid, or quota exceeded');
                    console.error('💡 Check: 1) API key validity 2) Vision API enabled 3) Billing enabled 4) Quota limits');
                }
                
                return null;
            }

            const data = await response.json();
            console.log('📥 Vision API response data:', data);
            
            // Check for API errors in response
            if (data.error) {
                console.error('❌ Vision API returned error:', data.error);
                return null;
            }
            
            // Extract text from response
            if (data.responses?.[0]?.textAnnotations?.[0]) {
                const extractedText = data.responses[0].textAnnotations[0].description;
                console.log('✅ OCR extracted text:', extractedText);
                return extractedText;
            }

            console.log('ℹ️ No text found in image');
            return null;
        } catch (error) {
            console.error('❌ Vision API Error:', error);
            return null;
        }
    }

    async getImageBase64(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return await this.blobToBase64(blob);
        } catch (error) {
            console.error('Image conversion error:', error);
            return null;
        }
    }

    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }
}
